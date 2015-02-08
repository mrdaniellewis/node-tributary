# Tributary

A transform stream that will merge one stream into another.  Intended to be used as part of a Gulp build process.

## new Tributary( options )

Creates a new `stream.Transform` with the options:

* `placeholderStart` - `String` - the opening text of the placeholder. Default = `<!-- include `
* `placeholderEnd` - `String` - the closing text the placeholder. Default = ` -->`
* `delimiter` - `String` - delimiter for the file name. Must be a single character. Default = `"`
* `getStream` - `Function` - The first argument is the filename from the placeholder, and the second a callback, which should be called with a `String`, `Buffer` or `stream.Readable`.

These are all optional.  If not supplied it will act just like a PassThrough stream.

### Placeholder

The placeholder is where a stream should be inserted into the existing stream.

It is the format `<!-- include "/path/to/file" -->`.  This must be exact. 

The opening start and end tags can be modified, so for example you could have `/* include "/path/to/file" */` for a CSS or JavaScript file.

The `/path/to/file/` will be passed to the `getStream` function, which should return the stream to encorporate.





