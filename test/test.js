/* jshint node:true, mocha: true */
"use strict";

var expect = require('expect');
var PassThrough = require('stream').PassThrough;
var Tributary = require('../');
var collect = require('stream-collect');
var promiseUtil = require('promise-util');

describe( 'a tributary stream', function() {

	it( 'acts as a PassThrough stream', function() {

		var stream = new Tributary();
		var ret = collect( stream, 'utf8' );

		stream.write( 'this is some data' );
		stream.end( ' written to my stream' );

		return ret
			.then( function(data) {
				expect(data).toBe( 'this is some data written to my stream' );
			} );


	} );

	it( 'matches a single placeholder', function() {
	
		function getStream( filename, cb ) {
			expect(filename).toBe('filename');
			cb('');
		}

		var stream = new Tributary( { getStream: getStream } );
		var ret = collect( stream, 'utf8' );

		stream.end( '<!-- include "filename" -->' );

		return ret
			.then( function(data) {
				// Placeholder should be removed
				expect(data).toBe( '' );
			} );

	} );

	it( 'matches multiple placeholders', function() {
	
		var filenames = [ 'filename1', 'filename2' ];

		function getStream( filename, cb ) {
			expect(filename).toBe(filenames.shift());
			cb('');
		}

		var stream = new Tributary( { getStream: getStream } );
		var ret = collect( stream, 'utf8' );

		stream.end( 'foo <!-- include "filename1" --> bar <!-- include "filename2" --> fee' );

		return ret
			.then( function(data) {
				expect(data).toBe( 'foo  bar  fee' );
			} );

	} );

	it( 'matches a placeholder across 2 chunks', function() {
	
		var data = 'foo <!-- include "filename" --> bar';

		function test( splitAt ) {

			function getStream( filename, cb ) {
				expect(filename).toBe('filename');
				cb('');
			}

			var stream = new Tributary( { getStream: getStream } );
			var ret = collect( stream, 'utf8' );

			stream.write( data.slice(0,splitAt) );
			stream.end( data.slice(splitAt) );

			return ret
				.then( function(data) {
					expect(data).toBe( 'foo  bar', '"' + data + '" != "foo  bar" when spliting at ' + splitAt );
				} );

		}

		// Create a test with each possible split over two parts
		var tests = [];
		for ( var i = 0, j = data.length; i < j; ++i ) {
			tests.push(i);
		}

		return new promiseUtil.Queue()
			.then( function(i) {
				return test(i);
			} )
			.runSeries(tests);
		
		

	} );

	it( 'matches a placeholder across 3 chunks', function() {

		// There are a lot of combinations to run!
		this.timeout( 10000 );

		var data = 'foo <!-- include "filename" --> bar';

		function test( splitAt1, splitAt2 ) {

			function getStream( filename, cb ) {
				expect(filename).toBe('filename');
				cb('');
			}

			var stream = new Tributary( { getStream: getStream } );
			var ret = collect( stream, 'utf8' );

			stream.write( data.slice(0,splitAt1) );
			stream.write( data.slice(splitAt1,splitAt2) );
			stream.end( data.slice(splitAt2) );

			return ret
				.then( function(data) {
					expect(data).toBe( 'foo  bar', '"' + data + '" != "foo  bar" when spliting at ' + splitAt1 + ' and ' + splitAt2 );
				} );

		}

		// Create a test with each possible split over three parts
		var tests = [];
		for ( var i = 0, j = data.length; i < j; ++i ) {
			for ( var m = i, n = data.length; m < n; ++m ) {
				tests.push( [i, m] );
			}
		}

		return new promiseUtil.Queue()
			.then( function(value) {
				return test(value[0],value[1]);
			} )
			.runSeries(tests);
		

	} );

	it( 'Doesn\'t match a broken placeholder', function() {
		
		var working = '<!-- include "filename" -->';

		function test( data ) {

			function getStream() {
				throw new Error('Should not be called');
			}

			var stream = new Tributary( { getStream: getStream } );
			var ret = collect( stream, 'utf8' );

			stream.end( data );

			return ret
				.then( function(ret) {
					expect(ret).toBe( data );
				} );

		}

		var tests = [];
		for ( var i = 1, j = working.length; i < j; ++i ) {
			tests.push( working.slice(0, i -1 ) + 'x' + working.slice(0, i ) );
		}

		return new promiseUtil.Queue()
			.then( function(value) {
				return test(value);
			} )
			.runSeries(tests);

	} );

	it( 'Doesn\'t match a broken placeholder across chunks', function() {
		
		// There are a lot of combinations to run!
		this.timeout( 10000 );

		var working = '<!-- include "filename" -->';

		function test( data, splitAt ) {

			function getStream() {
				throw new Error('Should not be called');
			}

			var stream = new Tributary( { getStream: getStream } );
			var ret = collect( stream, 'utf8' );

			stream.write( data.slice(0,splitAt) );
			stream.end( data.slice(splitAt) );

			return ret
				.then( function(ret) {
					expect(ret).toBe( data );
				} );

		}

		var tests = [];
		for ( var i = 1, j = working.length; i < j; ++i ) {
			var error = working.slice(0, i -1 ) + 'x' + working.slice(0, i );
			for ( var m = 0, n = error.length; m < n; ++m ) {
				tests.push( [ error,m ]);
			}
		}

		return new promiseUtil.Queue()
			.then( function(value) {
				return test(value[0],value[1]);
			} )
			.runSeries(tests);

	} );

	it('doesn\'t match if the filename exceeds maxFilename', function() {

		function getStream() {
			throw new Error('Should not be called');
		}

		var stream = new Tributary( { getStream: getStream, maxPathLength: 7 } );
		var ret = collect( stream, 'utf8' );

		stream.end( 'foo <!-- include "filename" --> bar' );


		return ret
			.then( function(data) {
				// Placeholder should be removed
				expect(data).toBe( 'foo <!-- include "filename" --> bar' );
			} );
	} );

	it( 'replaces placeholders with a string', function() {

		function getStream( filename, cb ) {
			cb('replacement');
		}

		var stream = new Tributary( { getStream: getStream } )
			.on( 'error', function(e) {
				console.log(e);
			} );

		var ret = collect( stream, 'utf8' );

		stream.end( 'foo <!-- include "filename" --> bar' );

		return ret
			.then( function(data) {
				// Placeholder should be removed
				expect(data).toBe( 'foo replacement bar' );
			} );


	} );

	it( 'replaces placeholders with a buffer', function() {

		function getStream( filename, cb ) {
			cb( new Buffer('replacement') );
		}

		var stream = new Tributary( { getStream: getStream } )
			.on( 'error', function(e) {
				console.log(e);
			} );

		var ret = collect( stream, 'utf8' );

		stream.end( 'foo <!-- include "filename" --> bar' );

		return ret
			.then( function(data) {
				// Placeholder should be removed
				expect(data).toBe( 'foo replacement bar' );
			} );


	} );

	it( 'replaces placeholders with a stream', function() {

		function getStream( filename, cb ) {
			var input = new PassThrough();

			cb( input );

			input.write( 'part 1 ');
			input.end( 'part 2');

		}

		var stream = new Tributary( { getStream: getStream } )
			.on( 'error', function(e) {
				console.log(e);
			} );

		var ret = collect( stream, 'utf8' );

		stream.end( 'foo <!-- include "filename" --> bar' );

		return ret
			.then( function(data) {
				// Placeholder should be removed
				expect(data).toBe( 'foo part 1 part 2 bar' );
			} );


	} );

	it( 'removes placeholders when getStream returns undefined ', function() {

		function getStream( filename, cb ) {
			cb();
		}

		var stream = new Tributary( { getStream: getStream } )
			.on( 'error', function(e) {
				console.log(e);
			} );

		var ret = collect( stream, 'utf8' );

		stream.end( 'foo <!-- include "filename" --> bar' );

		return ret
			.then( function(data) {
				// Placeholder should be removed
				expect(data).toBe( 'foo  bar' );
			} );


	} );

	it( 'allows custom placeholders', function() {

		function getStream( filename, cb ) {
			expect(filename).toBe('filename');
			cb('');
		}

		var stream = new Tributary( { getStream: getStream, placeholderStart: '/* include ', placeholderEnd: ' */' } );
		var ret = collect( stream, 'utf8' );

		stream.end( '/* include "filename" */' );

		return ret
			.then( function(data) {
				// Placeholder should be removed
				expect(data).toBe( '' );
			} );

	} );

	it( 'allows the end placeholder to be empty', function() {

		function getStream( filename, cb ) {
			expect(filename).toBe('filename');
			cb('');
		}

		var stream = new Tributary( { getStream: getStream, placeholderStart: '// include ', placeholderEnd: '' } );
		var ret = collect( stream, 'utf8' );

		stream.end( '// include "filename"' );

		return ret
			.then( function(data) {
				// Placeholder should be removed
				expect(data).toBe( '' );
			} );

	} );

	it( 'survies a really big file', function() {

		var fs = require('fs');
		var path = require('path');
		return collect( 
			fs.createReadStream( path.resolve( __dirname, 'war-and-peace.txt' ) )
				.pipe( new Tributary() )
		);


	} );

} );


