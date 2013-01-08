var MuxDemux = require('mux-demux')
var through  = require('through')
var EventEmitter = require('events').EventEmitter
var Schema   = require('scuttlebutt-schema')

//create a server that can wrap a leveldb.
//this assumes that the db already has scuttlebutt installed.
//it would be nice if it was possible to abstract this,
//and just wrap anything in a remote interface, like rpc
//but it's really not that simple, given that we are working with objects
//that are replicatable on their own.
//maybe we could detect that, oh, this method returned a stream,
//handle it this way - this object returned an object with createStream method
//maybe it's duplex? replicate it...
//^ those would both require having some smarts on the client,
//you'd need to know that it's gonna return a stream.
//so for now, we are gonna just write the client manually...

//COMBINE into one stream object...

/*
var remote = create(db, schema)
remote.createStream()

remote.open(name, cb)
remote.view(name).pipe(...)
*/

var remote = module.exports = function (schema) {

  schema = Schema(schema)

  //OKAY, so maybe write some test so I know this actually works?
  //ALSO, scuttlebutt needs to accept a ready scuttlebutt instance instead of name...

  var db = 'function' === typeof schema ? null : schema

  var emitter = new EventEmitter()

  var toOpen = [], toView = [], _open, _view

  //cache at this level, not on scuttlebutt.open

  emitter.open = function (name, tail, cb) {
    var sb = 'object' === typeof name ? name : schema(name)
    if(!_open)
      return toOpen.push([sb, tail, cb])
    _open(sb, tail, cb)
  }

  emitter.view = function () {
    var args = [].slice.call(arguments)
    if(_view)
      return _view.apply(null, args)
    var stream = through()
    toView.push({args: args, stream: stream})
    return stream
  }

  function ready () {
    while(_open && toOpen.length)
      _open.apply(null, toOpen.shift())
    while(_view && toView.length) {
      var v = toView.shift()
      _view.apply(null, v.args)
        .on('error', function (err) {
          //because stream errors are not propagated...
          v.stream.emit('error', err)
        }).pipe(v.stream)
    }
  }

  emitter.openDb = function (_db) {
    db = _db
    if(!db.isOpen()) db.open()

    //leveldb already buffers while it's loading
    //can I trust that?

    _open = function dbOpen () {
      return db.scuttlebutt.open.apply(db.scuttlebutt, arguments)
    }

    _view = function dbView () {
      return db.scuttlebutt.view.apply(db.scuttlebutt, arguments)
    }

    db.once('close', function () {
      if(_open == dbOpen) _open = null
      if(_view == dbView) _view = null
      //the streams should error or something,
      //if they are still connected when this happens.
    })

    ready()

    return this
  }

  emitter.createStream = function (isServer) {

    var mx = MuxDemux(function (stream) {
      if(!db) return stream.error('cannot access database this end')
      //if(!db.isOpen())
      //  return stream.error('db is not open yet')

      if('string' === typeof stream.meta) {
        var name = stream.meta.replace(/^doc-/, '')
        var ts = through().pause()
        //TODO. make mux-demux pause.

        stream.pipe(ts)
        //load the scuttlebutt with the callback,
        //and then connect the stream to the client
        //so that the 'sync' event fires the right time,
        //and the open method works on the client too.
        db.scuttlebutt(stream.meta, function (err, doc) {
          ts.pipe(doc.createStream()).pipe(stream)
          ts.resume()
        })
      } else if(Array.isArray(stream.meta)) {
        //reduce the 10 most recently modified documents.
        db.mapReduce.view.apply(db.mapReduce.view, stream.meta)
          .pipe(through(function (data) {
            this.queue(JSON.parse(data.value))
          }))
          .pipe(stream)
      }
    })

    if(db) {
      function onClose () { mx.end() }
      //TODO: make pull request to have close event
      //that fires when db STARTS to close
      db.once('closed', onClose)  
      mx.once('close', function () {
        db.removeListener('closed', onClose)
      })
    }

    var clientOpen = 
      require('scuttlebutt-schema')
        .open(schema,
          function (name) {
            return mx.createStream(''+name) //force to string.
          })

    function clientView (name, opts) {
      var args = [].slice.call(arguments)
    
      //enhance this to match api of server levelup...
      //and maybe ... wrap reconnect... abstract out reloading
      //so that it is more like having the database local.

      return mx.createStream(args)
    }

    //scuttlebutts can be reconnected automatically,
    //when the stream is reconnected, or the server changes.
    //can also defer the call, until there is a connection/db is open...

    //really, this is where the cache should be, not around db.scuttlebutt.open
    //will need the list of current scuttlebutts to reconnect with...

    _open = function (name, cb) {
      return db ? db.scuttlebutt.open(name, cb) : clientOpen(name, cb)
    }

    //for about timed events, it will be possible to replay them in order...
    //from the thing last recieved. for streams that update randomly that won't work,
    //so you'll have to restream the whole thing when you reconnect.
    //(best to let the user reconnect again, if that is what they want)

    _view = function () {
      var view = db && db.scuttlebutt.view
      return db ? view.apply(view, arguments) : clientView.apply(null, arguments)
    }

    ready()

    return mx
  }

  return emitter
}

//hmmm... so this function return a stream.
//but, we'll have autonode...

/*

//SCRATCHPAD

var db
var autonode = Autonode(function (stream) {
   stream.pipe(this.isServer ? remote(db) : remote(schema)).pipe(stream)
}).connect(port)

autonode.on('listening', function () {
  //open the db,
  levelup(path, function (err, db) {
    autonode.emit('open', db)
  })
})

//open is defered until either the database is opened

autonode.on('connecting', function () {
  //close the db
  db && db.isOpen() && db.close(function (err) {
    console.error(err)
  })
  db = null
})

*/
