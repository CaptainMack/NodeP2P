var xmlrpc = require('xmlrpc'),
    _ = require('underscore'),
    utils = require('./utils'),
    checksum = require('checksum'),
    cs = checksum('dshaw'),
    fs = require('fs'),
    measured = require('measured');

function Peer(options) {
  // Invokes with new if called without
  if (false === (this instanceof Peer)) {
    return new Peer(name, options);
  }

  var self = this;
	
  this.stats = measured.createCollection();
  this.host = options.host;
  this.port = options.port;
  this.name = options.name || "P-"+utils.guid();
  this.files = options.files || [];
  this.capacity = options.capacity ||  utils.powerLawRandom(1, 10); // [1 - 10]
  
  this.debug = options.debug || false;

  this.NEIGHBORHOOD_DELAY = 15000; // Interval between evalutating neighbor set

  this.neighbors = [];
  this.knownPeers = [];
  this.loggedRequests = [];
  this.routingMetric = 0;
  this.waitingFriendRequests = 0;

  this.routes = {
    'hello': 'recievedHello',
    'helloBack': 'recievedHelloBack',
    'requestFriendship': 'recievedFriendRequest',
    'desolveFriendship': 'recievedFriendDesolve',
    'findAFriend': 'recievedFindAFriend',
    'requestFile': 'recievedFileRequest',
    'requestkFile': 'recievedkFileRequest',
    'fileFound': 'recievedFileFound',
    'requestNlist': 'recievedNlistRequest',
    'fetchFile': 'recievedFetchFileRequest',
    'requestPeerReport': 'recievedPeerReportRequest'
  };

  this.fileRequestListeners = {};


  this.initServer();

  // Setup interval for evaluation of neighbors
  this.evalInterval = setInterval(function() {
    self.reevaluateFriendships();
  }, this.NEIGHBORHOOD_DELAY);

  this.log("Peer '"+this.name+"' created on: "+this.host+':'+this.port+' with capacity '+this.capacity);
  this.log("Available files:");
  for(var i = 0;i<this.files.length;i++)
    this.log("  - "+this.files[i]);
}

/**
 * Static values
 **/
Peer.DEFAULT_TTL = 5;
Peer.DEFAULT_K = 4;
Peer.BASE_FILE_DIR = "./peer_files";

Peer.prototype.initServer = function() {
  var self = this;

  // Setup peer host
  var server = xmlrpc.createServer({host:this.host, port:this.port});

  _.each(this.routes, function(action, route) {
    server.on(route, function(err, params, callback) {
      self[action].call(self, err, params, callback);
    });

  });

};


Peer.prototype.hello = function hello(options) {
  if (options && options.host && options.port) {
    this.sayHello(options.host, options.port);
  } else {
    this.forwardHello();
  }
};

/**
 * Send Hello request to other known peer
 **/
Peer.prototype.sayHello = function sayHello(host, port, params){  
  // Set params
  if (!params) {
    params = {
      origin: this.serialize(),
      ttl: Peer.DEFAULT_TTL,
      request_id: utils.guid()
    };
  } else {
    params = _.clone(params);
  }

  // Sends a method call to the XML-RPC server
  this.callPeer('hello', {host: host, port: port}, params);
};

Peer.prototype.forwardHello = function forwardHello(request) {
  var peersToGreet;
  if (request) {
    // TODO: Use neighbors?
    peersToGreet = _.filter(this.knownPeers, function(peer) {
      return !_.isEqual(peer, request.from) && !_.isEqual(peer, request.origin);
    });
  } else {
    peersToGreet = this.knownPeers;
  }
  //this.log("Forward request to "+peersToGreet.length+" peers out of "+this.knownPeers.length);
  
  if (peersToGreet.length<=0) return;

  for(var i=0;i<peersToGreet.length;i++) {
    this.sayHello(peersToGreet[i].host, peersToGreet[i].port, request);
  }
};

/**
 * Send response to hello to other peer.
 * Making its existence visible to greeter
 **/
Peer.prototype.sayHelloBack = function(request) {
  // Sends a method call to the origin peer
  this.callPeer('helloBack', request.origin);
};

/**
 * Recieve Hello request from other peer
 **/
Peer.prototype.recievedHello = function (err, params, callback) {
  // Send empty response to end connection
  callback(null, '');

  request = params[0];
  if (!this.hasSeenRequest(request.request_id)) {
      this.loggedRequests.push(request.request_id);
      
      //this.log('Recieved HELLO: From ' + request.from.port + " Origin: "+request.origin.port);

      // Return answer to origin
      this.sayHelloBack(request);
      request.ttl--;

      // Forward request to known peers
      if (request.ttl > 0) {
        this.forwardHello(request);
      }

      // Add requester to known peers
      this.addKnownPeer(request.from);
      if (!_.isEqual(request.from, request.origin)) {
        this.addKnownPeer(request.origin);
      }

  } else {
    //self.log("Redundant request: "+params.request_id);
  }
};

/**
 * Recieve response to hello
 * Add sender to known peers
 **/
Peer.prototype.recievedHelloBack = function (err, params, callback) {
    // Close connection
    callback(null, '');

    var otherPeer = params[0].from;

    //this.log("Recieved helloBack from "+otherPeer.host+":"+otherPeer.port);
    this.addKnownPeer(otherPeer);
    
    // Send empty response to end connection
    
};

/**
 * Handle friendship request
 * Condition:
 * This peer have open spots OR
 * This peer has more than half of peers with same of higher capacity as itself (after switch)
 */
Peer.prototype.recievedFriendRequest = function(err, params, callback) {
  var self = this,
      otherPeer = params[0].from,
      success = false;

  // Has empty spots
  if (this.nlist().length < this.capacity) {
    success = true;
  } else {

    // Find peer to kick (lowest capacity peer higher the this)
    var kickablePeer = null;
    _.each(this.nlist(), function(p) {
      if (p.capacity >= self.capacity && (kickablePeer === null || kickablePeer.capacity>p.capacity)) {
        kickablePeer = p;
      }
    });

    // If kickable peer found, kick it and accept new request instead
    if (kickablePeer !== null && otherPeer.capacity > kickablePeer.capacity) {
      this.desolveFriendship(kickablePeer);
      success = true;
    }
  }

  if (success) {
    this.addNeighbor(otherPeer);
    callback(null, 'SUCCESS');    
  } else {
    callback(null, 'REJECT');
  }
};


Peer.prototype.recievedFriendDesolve = function(err, params, callback) {
  // Close connection
  callback(null, '');

  var otherPeer = params[0].from;

  // Remove from neighbor list
  this.removeNeighbor(otherPeer);
};


Peer.prototype.recievedFindAFriend = function(err, params, callback) {
  // Send empty response to end connection
  callback(null, '');

  var self = this;

  var request = params[0];

  if (this.capacity > this.neighbors.length && !this.isNeighbor(request.origin)) {
    // You can be friends with me
    this.log("Found a friend in me! Requester: "+request.origin.port);
    this.seekFriendship(request.origin);
  } else if (this.getMostCapableNeighbor().capacity < request.origin.capacity  && !this.isNeighbor(request.origin)) {
    // Capacity is better than the best I have. I want to be your friend
    this.log("I want you to be my new friend! Requester: "+request.origin.port);

    var peerToKick = _.min(this.neighbors, function(p) {
      // Do not kick peer with capacity less than this
      return p.capacity + (p.capacity<self.capacity ? 10 : 0);
    });

    this.log("Peer to kick: "+peerToKick.port+" c="+peerToKick.capacity);
    this.seekFriendship(request.origin, function() {
      self.desolveFriendship(peerToKick);
    });

  } else {
    request.ttl--;

    // Forward request to neighbor
    if (request.ttl > 0) {
      
      // Sort highest first
      var sortedNeighbors = _.sortBy(this.neighbors, function(p) { return -p.capacity; });
      sortedNeighbors = _.reject(sortedNeighbors, function(p) {
        return p.port == request.from.port && p.host == request.from.host || p.port == request.origin.port && p.host == request.origin.host;
      });

      if (sortedNeighbors.length === 0) return; // No one to forward to

      // Forward according to power law - will prefer more capable peers
      var i = utils.powerLawRandom(1, sortedNeighbors.length);

      // Forward
      this.findMeAFriend(sortedNeighbors[ i -1 ], request);
    }
  }

};

/**
 * Consider whether this peer needs a neighbor and if this would be a good match.
 * Should be called each time the peer hears from a new peer
 **/
Peer.prototype.considerFriendship = function(otherPeer) {
  // Is there room for more?
  if (this.nlist().length < this.capacity && otherPeer.capacity >= this.capacity && otherPeer.capacity > 1) {
    this.seekFriendship(otherPeer);
  }
};

Peer.prototype.seekFriendship = function(otherPeer, onSuccess) {
  var self = this;
  // Optimistic - assumes send requests are successfull
  //self.log("seekFriendship: waiting="+this.waitingFriendRequests+" capacity="+this.capacity);
  if (this.waitingFriendRequests >= this.capacity - this.neighbors.length) return;

  this.waitingFriendRequests++;

  self.callPeer('requestFriendship', otherPeer, null, function(err, response) {
    if (!err && response === 'SUCCESS') {
      
      if (onSuccess && _.isFunction(onSuccess))
        onSuccess();

      self.log("Friendship request was accepted");
      self.addNeighbor(otherPeer);
    } 
    self.waitingFriendRequests--;
  });
};

Peer.prototype.desolveFriendship = function(otherPeer) {
  this.removeNeighbor(otherPeer);
  this.callPeer('desolveFriendship', otherPeer);
};

Peer.prototype.reevaluateFriendships = function() {
  // Periodically run through and optimize neighbor sets
  var self = this;

  // Ping neighbors


  // Find new neighbors - if there is room
  if (this.neighbors.length >= this.capacity) return;

  // Sort highest first
  var sortedPeers = _.sortBy(this.knownPeers, function(p) { return -p.capacity; });

  // findMeAFriend - ask most capable peers (random by power law)
  var requestsSend = 0;
  var attempts = 0;

  while (requestsSend < this.capacity-this.neighbors.length && requestsSend < this.knownPeers.length && attempts < 20) {

    var i = utils.powerLawRandom(1, sortedPeers.length);
    if (sortedPeers[i] && !_.isEqual(sortedPeers[i], this.serialize())) {
      this.log("Looking for new friends. Starting at "+sortedPeers[i].name);
      this.findMeAFriend(sortedPeers[i]);
      requestsSend++;
    }

    attempts++;
  }

};

Peer.prototype.findMeAFriend = function(otherPeer, params) {
  // Set params
  if (!params) {
    params = {
      origin: this.serialize(),
      ttl: Peer.DEFAULT_TTL * 3 // Only one walker
    };
  } else {
    params = _.clone(params);
  }

  // Sends a method call to the XML-RPC server
  this.callPeer('findAFriend', otherPeer, params);
};


Peer.prototype.recievedNlistRequest = function(err, params, callback) {
  callback( null, JSON.stringify(this.nlist() ));
};

Peer.prototype.getKnownPeerByName = function(peerName) {

  return _.findWhere(this.plist(), {name: peerName});
  /*if (peer) {
    this.callPeer('requestNlist', peer, {}, function(err, value) {
      var nlist = JSON.parse(value);
      callback(value);
    });
  }*/
  
};

/********
 * Utility methods for peer
 ********/

Peer.prototype.plist = function plist() {
  return this.knownPeers;
};

Peer.prototype.nlist = function nlist() {
  return this.neighbors;
};

Peer.prototype.callPeer = function(method, peer, params, callback) {
  // Setup params
  if (!params) {
    params = {};
 }

  params.from = this.serialize();

  // Creates an XML-RPC client. Passes the host information on where to
  // make the XML-RPC calls.
  var options = {
    host:peer.host,
    port:peer.port,
    path: '/'
  };
  var client = xmlrpc.createClient(options);

  // Setup callback
  if (!callback || !_.isFunction(callback)) {
    callback = function(err, value) {};
  }

  if (method != "hello" && method != "helloBack") // Way too many
    this.log("Send '"+method+"' to: "+peer.host+":"+peer.port+(params.ttl ? ', TTL left: '+params.ttl : ''));

  // Sends a method call to the XML-RPC server
  client.methodCall(method, [params], callback);
};

Peer.prototype.addKnownPeer = function(otherPeer) {
  // Add peer conn if it doesn't exists
  if (!_.findWhere(this.knownPeers, otherPeer)) {
    //this.log("Add peer to list of known peers: "+otherPeer.host+":"+otherPeer.port);
    this.knownPeers.push(otherPeer);

    this.considerFriendship(otherPeer);
  }
};

Peer.prototype.isNeighbor = function(otherPeer) {
  return _.findWhere(this.neighbors, otherPeer) ? true : false;
};

Peer.prototype.addNeighbor = function(otherPeer) {
  // Add peer  if it doesn't exists
  if (this.isNeighbor(otherPeer)) return;
  
  this.log("Add peer to list of neighbor peers: "+otherPeer.host+":"+otherPeer.port);
  if (this.neighbors.length >= this.capacity) {
    this.log("ERROR: No room for new neighbor");
  } 
  //else { Add for easier debugging
    this.neighbors.push(otherPeer);
  //}
    
  
};

Peer.prototype.removeNeighbor = function(otherPeer) {
  this.neighbors = _.reject(this.neighbors, function(p) { 
    return p.host == otherPeer.host && p.port == otherPeer.port; 
  });
};

Peer.prototype.getMostCapableNeighbor = function() {
  return _.max(this.neighbors, function(p) { return p.capacity; });
};

Peer.prototype.hasSeenRequest = function(requestId) {
  return _.contains(this.loggedRequests, requestId);
};

Peer.prototype.getFilePath = function(fileId) {
  return Peer.BASE_FILE_DIR + "/" + fileId;
};

Peer.prototype.getPeerReport = function() {
  return this.stats.toJSON();
};

/**
 * Start new file search!
 **/
Peer.prototype.searchFile = function searchFile(file, callback, ttl){  
  // Set params
  this.log("[FIND] Search initiated");

  params = {
    origin: this.serialize(),
    ttl: ttl || Peer.DEFAULT_TTL,
    request_id: utils.guid(),
    file_id: file
  };

  

	if (!_.contains(this.files, params.file_id))	{
	  if (callback && _.isFunction(callback)) {
      this.fileRequestListeners[file] = callback;
    }

    for(var i=0; i<this.neighbors.length; i++)	{
	  	this.callPeer('requestFile', {host: this.neighbors[i].host, port: this.neighbors[i].port}, params);
	  }
	} else {
    this.log("File found locally - no need to retrieve");
	}
};
  
  /**
   * Start kfind file search!
   **/
  Peer.prototype.searchKFile = function searchkFile(file, callback, ttl, kNum){  
    // Set params
    if (!kNum) 
      kNum = Peer.DEFAULT_K;

    this.log("[kFIND] Search initiated. kNum = "+kNum);
    

	  params = {
	    origin: this.serialize(),
	    ttl: ttl || Peer.DEFAULT_TTL,
	    request_id: utils.guid(),
	    kNeighbors: kNum,
	    callBack: 1,
	    file_id: file
	  };
  
    if (this.neighbors.length==0) {
      console.log("This peer has no neighbors. Cannot start search");
      return;
    }

  if (!_.contains(this.files, params.file_id))	{
    if (callback && _.isFunction(callback)) {
      this.fileRequestListeners[file] = callback;
    }

    var i = 0;
    while(i<Math.min(kNum, this.neighbors.length))	{
    	var randomNeighbor = Math.floor((Math.random()*Math.min(kNum, this.neighbors.length)));
    	if (this.neighbors[randomNeighbor]) {
        this.callPeer('requestkFile', {host: this.neighbors[randomNeighbor].host, port: this.neighbors[randomNeighbor].port}, params);
        i++;
      }
    }
  }	else {
  	  this.log("File found locally - no need to retrieve");
  }
};



/**
 * Recieve file request 
 * Check if peer contains file, if not, forward request.
 **/
Peer.prototype.recievedFileRequest = function (err, params, callback) {
    // Close connection
    callback(null, '');
    var self = this;
    var request = params[0];
    	request.ttl--;
    this.log("Recieved File Request: " + request.file_id);
    this.stats.meter('fileRequestMeter').mark();
    if (!this.hasSeenRequest(request.request_id))	{
    	this.loggedRequests.push(request.request_id);
	    this.routingMetric++;
		if (_.contains(this.files, request.file_id))	{
      self.log("Does contain file: "+self.getFilePath(request.file_id));
      checksum.file( self.getFilePath(request.file_id), function (err, sum) {
  		 	request.checksum = sum;
        request.file_server = self.serialize();
        self.log("Send file found. Checksum: "+sum+" for file: "+self.getFilePath(request.file_id));
  			self.callPeer('fileFound', {host: request.origin.host, port:request.origin.port}, request); 
  		});
		} else {
			if (request.ttl != 0)	{
				for(var i=0; i<this.neighbors.length; i++)	{
					this.callPeer('requestFile', {host: this.neighbors[i].host, port: this.neighbors[i].port}, request);
				}
			}
		}
	}
};

/**
 * Recieve kFile request 
 * Check if peer contains file, if not, forward request to kNeighbors.
 **/
Peer.prototype.recievedkFileRequest = function (err, params, callback) {
    // Close connection
    var self = this;
    var request = params[0];
    	request.ttl--;
    	request.callBack++;
   	if(request.callBack % 4 == 0)	{
   		//Callback and check if the the file has been found
   		self.callPeer('hasFileBeenFound', {host: request.origin.host, port:request.origin.port}, request);
   	}
    this.log("Recieved kFile Request: " + request.file_id);
    this.stats.meter('fileRequestMeter').mark();
    if (!this.hasSeenRequest(request.request_id))	{
    	this.loggedRequests.push(request.request_id);
	    this.routingMetric++;
		if (_.contains(this.files, request.file_id))	{
      checksum.file(self.getFilePath(request.file_id), function (err, sum) {
		 	request.checksum = sum;
      request.file_server = self.serialize();
			self.callPeer('fileFound', {host: request.origin.host, port:request.origin.port}, request); 
		 });
		} else {
			if (request.ttl != 0)	{
				for(var i=0; i<this.neighbors.length; i++)	{
					this.callPeer('requestKFile', {host: this.neighbors[i].host, port: this.neighbors[i].port}, request);
				}
			}
		}
	}
};


/**
 * File found 
 * Checks if peer has correct file (checksum) and then retrieves it.
 **/
Peer.prototype.recievedFileFound = function (err, params, callback) {
    // Close connection
    callback(null, '');
    var self = this;
    var request = params[0];
    //this.log("File found! Validating checksum: " + request.checksum);
  	checksum.file(self.getFilePath(request.file_id), function (err, sum) {
  			//send MD5 params[0].origin.host:params[0].origin.port
  			if(request.checksum == sum)	{
  				self.log("Correct Checksum! File located at peer: "+request.file_server.name);

          // Notify listener
          if (self.fileRequestListeners[request.file_id]) {
            self.fileRequestListeners[request.file_id](request.file_server);
            delete self.fileRequestListeners[request.file_id];
          }
  			} else {
  				self.log("Incorrect Checksum, maybe the file have been modified?");
  			}
  	});
};

Peer.prototype.downloadFile = function(fileId, peer, callback) {
  if (!peer.host || !peer.port) return;

  this.callPeer('fetchFile', peer, {file_id: fileId}, function(err, value) {
    if (!err)
      callback(value);
  });
};

Peer.prototype.recievedFetchFileRequest = function(err, params, callback) {
  var fileId = params[0].file_id;

  if (_.contains(this.files, fileId)) {
    fs.readFile(this.getFilePath(fileId), function(err, data) {
      callback(null, data);
    });
  } else {
    callback(404);
  }
};

/**
 * Has file been found?
 * Peers call to check if the file have been found or not.
 **/
Peer.prototype.recievedHasFileBeenFound = function (err, params, callback) {
    // Close connection
    var self = this;
    var request = params[0];
    callback(null, '');
};


/**
 * Stats function 
 * returns a JSON array with statistics related to peer-requests.
 **/

Peer.prototype.recievedPeerReportRequest = function(err, params, callback) {
  // Close connection
  console.log("SENDING: " + JSON.stringify(this.stats.toJSON()));
  callback(null, {name: this.name, report: this.stats.toJSON()});
};

/**
 * Return object representation of this peer
 */
Peer.prototype.serialize = function() {
  return {
      name: this.name,
      host: this.host, 
      port: this.port,
      capacity: this.capacity
  };
};

Peer.prototype.log = function log(string) {
  if (!this.debug) return;
  var date = new Date(),
      dateString = date.getHours()+":"+date.getMinutes()+":"+date.getSeconds(); 
  
  console.log("["+dateString+"]["+this.name+"] "+string);
};

Peer.prototype.toString = function toString() {
  return "[name="+this.name+", host="+this.host+", port="+this.port+", capacity="+this.capacity+"]";
};


module.exports = Peer;

