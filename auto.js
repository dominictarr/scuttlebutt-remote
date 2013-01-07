
//okay... so, automatically open leveldb,
//and close leveldb, when you become the server.
//so, 

var autonode = require('autonode')
var remote = require('./remote')

autonode(function (stream) {
    //accept a connection from the client...
    if(this.isServer) {
      //if db is not open, tell the client to reconnect...
      if(!db.isOpen()) return stream.destroy()
      stream.pipe(Remote(db).pipe(stream)
    }
    //we have connected to the server...
    else {
      stream.pipe(Remote(schema).pipe(stream)
      //connect all open instances
    }
  }).listen(9999)
  .on('listening', function () {
    if(db.isClosed()) {
      db.open() //we are the server... open the database.
    }
    //when the database closes,
    //reconnect any open scuttlebutt instances to the db...
    //... so, if we are preserving the open instances,
    //we might as well buffer open calls until the database is opened...
    //that gives us a consistent api, at least.
    db.on('close', function () {
      //disconnect all scuttlebutt instances from the database.
    })
  })
  .on('connecting', function () {
    //connecting to server...
    //close the server
    if(db.isOpen()) db.close()
  })

//hmm, this is the layer that we should apply caching...
//hmm, maybe the easy way to reconnect is to just open another sb,
//and connect that to the current instance?
function open (name) {
  scuttlebutt = autonode.isServer ? ls.open(name) : remote.open(name)
}

