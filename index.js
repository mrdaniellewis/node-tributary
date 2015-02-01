/* jshint node:true */
"use strict";

var stream = require('stream');
var util = require('util');

var debug = require('debug')('tributary');

// Very verbose debugging, best left commented out
// var debugVerbose = require('debug')('tributary:verbose');

/**
 *  Tests if the placeholder is within the stream
 *  @param {String} start The placeholder start
 *  @param {String} start The placeholder end
 *  @param {Integer} maxPathLength The maximum length of the placeholder
 */
function Matcher( start, end, maxPathLength) {
    this.delimiter = '"';
    this.maxPathLength = maxPathLength || 512;
    this.cursor = 0;
    this.filename = '';

    this.compile( start, end );
}

/**
 *  Creates a list of states to move through
 */
Matcher.prototype.compile = function( start, end ) {

    this.sequence = start.split('')
        .concat(this.delimiter)
        .concat(states.startCapture.bind(this))
        .concat(states.capture.bind(this))
        .concat(end.split(''));

};

/**
 *  Moves through the states
 *  @param {String} chr The character to match
 *  @returns {String} The result of moving through the state
 */
Matcher.prototype.next = function(chr) {

    var state = this.sequence[this.cursor];

    if ( typeof state === 'string' ) {
        if ( state === chr ) {
            ++this.cursor;
        } else if ( this.cursor !== 0 ) {
            this.cursor = -1;
        }
    } else if ( typeof state === 'function' ) {
        state(chr);
    }

    switch( this.cursor ) {

        case 0: 
            return 'no-match';
        case 1:
            return 'match-start';
        case -1:
            this.cursor = 0;
            return 'match-abort';
        case this.sequence.length:
            this.cursor = 0;
            return 'match-found';
    }

    return 'matching';

};

var states = {

    startCapture: function(chr) {
        this.filename = '';
        ++this.cursor;
        this.next(chr);
    },

    capture: function(chr) {
        if ( chr === this.delimiter ) {
            ++this.cursor;
        } else {
            this.filename += chr;
            if ( this.filename.length > this.maxPathLength ) {
                this.cursor = -1;
            }
        }
    }
};


/**
 *  Include one stream in another
 *  @param {String} [options.placeholderStart="<!-- include "] The start placeholder
 *  @param {String} [options.placeholderStart=" -->"] The end placeholder
 *  @param {Integer} [options.maxPathLength] The maximum length of a path
 *  @param {Function} getStream A function that when provided with a filename
 *      and callback will return a stream to be included.
 */
function Tributary( options ) {

    options = options || {};

    stream.Transform.call( this, { encoding: options.encoding } );

    this.getStream = options.getStream || function( filename, cb ) {
        return cb();
    };

    this._matcher = new Matcher( 
        options.placeholderStart || '<!-- include ',
        options.placeholderEnd || ' -->',
        options.maxPathLength
    );
       
    this._tributaryState = {
        chunk: null,
        cursor: 0,
        contentStart: 0,
        contentEnd: -1,
        remainder: 0
    };
 
}

util.inherits( Tributary, stream.Transform );

Tributary.prototype._insertFile = function( input ) {

    var data;

    if ( !stream ) {
        this._nextChr();
        return;
    }

    if ( typeof input === 'string' || Buffer.isBuffer(input) ) {
        data = input;
        input = new stream.PassThrough();
    }

    // Push the file into this stream
    input
        .on( 'data', function(chunk) {
            this.push(chunk);
        }.bind(this) )
        .on( 'end', this._nextChr.bind(this) )
        .on( 'error', this.emit.bind( this, 'error' ) );

    if ( data !== undefined ) {
        input.end(data);
    }
};

/**
 *  Process the next octet in the stream
 */
Tributary.prototype._nextChr = function(cb) {

    var ts = this._tributaryState;

    var chr = ts.chunk[ts.cursor++];

    if ( chr === undefined ) {
        // End of chunk

        if ( ts.contentEnd > -1 ) {
            // Ouput any unmatched parts of the chunk
            this.push( ts.chunk.slice( ts.contentStart, ts.contentEnd ) );
            ts.remainder = ts.chunk.slice(ts.contentEnd);

        } else {
            this.push( ts.chunk.slice(ts.contentStart) );
        }

        // End the processing of this chunk
        ts.cb();
        return;
    }

    var match = this._matcher.next(chr);

    //debugVerbose( 'match result', chr, match, this._matcher.filename, ts.cursor, ts.contentStart, ts.contentEnd );

    switch( match ) {

        case 'no-match':
            // Do nothing
            this._nextChr();
        break;
        case 'match-start':
            // Match has started
            if ( ts.contentEnd === -1 ) {
                ts.contentEnd = ts.cursor - 1;
            }
            /* falls through */
        case 'matching':
            this._nextChr();
        break;  
        case 'match-abort':
            ts.contentEnd = -1;
            this._nextChr();
        break;
        case 'match-found':
            // Match found

            // Push part of the chunk before the match
            this.push( ts.chunk.slice( ts.contentStart, ts.contentEnd ) );
            // Reset the start cursor
            ts.contentStart = ts.cursor;
            ts.contentEnd = -1;

            // Insert the file
            this.getStream( this._matcher.filename, this._insertFile.bind(this) );
        break;
    }
  
};

Tributary.prototype._transform = function( chunk, enc, cb ) {

    var ts = this._tributaryState;

    if ( Buffer.isBuffer(chunk) ) {
        // Much as this is deprecated, it is needed here
        chunk = chunk.toString('binary');
    }

    debug( 'transform', chunk );

    if ( ts.remainder ) {
        // If we have a partly matched placeholder from a pervious chunk
        // than prepend this chunk
        ts.chunk = ts.remainder + chunk;
        ts.cursor = ts.remainder.length;
        ts.contentStart = ts.contentEnd = 0;
        ts.remainder = null;
    } else {
        ts.chunk = chunk;
        ts.contentEnd = -1;
        ts.contentStart = ts.cursor = 0;
    }
    ts.cb = cb;
    this._nextChr();
};

Tributary.prototype._flush = function( cb ) {
    var ts = this._tributaryState;

    // Flush any partly matched placeholder
    if ( ts.remainder ) {
        this.push( ts.remainder );
    }
    cb();
};

if ( debug.enabled ) {
    // If we are debugging then output what we are pushing
    Tributary.prototype.push = function( data, encoding ) {
        if ( data !== null ) {
            debug( 'output', data.toString(encoding) );
        }
        stream.PassThrough.prototype.push.call( this, data, encoding );
    };
}

module.exports = Tributary;