/************
 * CLI Version of peer
 * Run using: node RunnablePeer.js
 *  - Can be run with optional parameters:  node RunnablePeer.js --name="SomeName" --port=8000 --host="localhost"
 * Interactive commands:
 *  > hello [host:port]
 *  > plist 
 ************/

var Peer = require('./Peer'),
	DotMaker = require('./dotmaker'),
	prompt = require('prompt'),
	_ = require('underscore'),
	argv = require('minimist')(process.argv.slice(2));

var options = {
	"host": argv.host || "localhost",
	"port": argv.port || 8000,
	"name": argv.name,
	"debug": argv.debug ? true : false,
	"capacity": 10,
};

var mypeer = new Peer(options);

console.log("Peer created: "+mypeer);

prompt.start();

getCommand();

function getCommand() {
	prompt.get(['command'], onCommand);
}

function onCommand(err, result) {
	if (err) { return onErr(err); }
	
	var input = result.command.split(" ");
	var cmd = input.shift();

	console.log('Command recieved: ' + cmd);

	var listener = "on" + cmd.charAt(0).toUpperCase() + cmd.slice(1).toLowerCase();


	if (_.has(actions, listener) && _.isFunction(actions[listener])) {
		actions[listener](input);
	} 

	getCommand();
}

function onErr(err) {
	console.log(err);
	return 1;
}

var actions = {
	// hello [ip:port]
	onHello: function(args) {
		var options = null;
		if (args[0]) {
			var optionsArray = args[0].split(":");
			options = {
				"host": optionsArray[0],
				"port": optionsArray[1]
			};
		}
		console.log("Running Hello. Options="+JSON.stringify(options));
		mypeer.hello(options);
	},

	// plist
	onPlist: function(args) {
		console.log("Listing known peers:");
		var list = mypeer.plist();
		if (list.length > 0) {
			for(var i=0; i<list.length; i++) {
				console.log(" -- Host="+list[i].host+", Port="+list[i].port);
			}
		} else {
			console.log("  -- No peers found");
		}
	},

	// nlist [peers] [-o output.dot]
	onNlist: function(args) {
		var dotmaker = new DotMaker();
		var filename = null,
			peers = null;

		var onComplete = function() {
			if (filename) {
				console.log("Create dot file: "+args[1]);
				dotmaker.createDotFile(args[1]);
			} else {
				console.log(dotmaker.getDotString());
			}
		};

		if (args.length > 1 && args[args.length-2] === "-o") {
			filename = args[args.length-1];
			peers = args.slice(0, args.length-2);
		} else {
			peers = args;
		}

		//console.log("Find for peers: "+JSON.stringify(peers));
		//console.log("Save to: "+filename);
		
		if (peers && peers.length > 0) {
			// Specified peer list
			var calledBack = 0;

			_.each(peers, function(p, i) {

				var peer = mypeer.getKnownPeerByName(p);
				if (!peer) {
					calledBack++;
					return;
				}

				mypeer.callPeer('requestNlist', peer, {}, function(err, value) {
					console.log("Received callback: "+value);
					calledBack++;

					if (!value) return;
					var nlist = JSON.parse(value);

					dotmaker.addConnections(peer, nlist);
					

					if (calledBack >= peers.length) 
						onComplete();
				});
			});
		} else {
			dotmaker.addConnections(mypeer, mypeer.nlist());
			onComplete();
		}

		
	},

	// find filename
	onFind: function(args) {
		var filename = args[0];

		mypeer.searchFile(filename, function(server_peer) {
			console.log("Found file at peer: "+server_peer.name+" on address "+server_peer.host+":"+server_peer.port);
		});
	},

	// kfind filename
	onKfind: function(args) {
		var filename = args[0];
		var kNum = args[1] || 4;

		mypeer.searchKFile(filename, function(server_peer) {
			console.log("Found file at peer: "+server_peer.name+" on address "+server_peer.host+":"+server_peer.port);
		}, null, kNum);
	},

	// get filename peer
	onGet: function(args) {
		if (args.length<2) {
			console.log("Not enough arguments provided");
		}

		var fileId = args[0];
		var optionsArray = args[1].split(":");
		var peer = {
				"host": optionsArray[0],
				"port": optionsArray[1]
			};

		console.log("Request file "+fileId+" from peer: "+JSON.stringify(peer));

		mypeer.downloadFile(fileId, peer, function(content) {
			console.log("File downloaded! Content: "+content);
		});
	}


};