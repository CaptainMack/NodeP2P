var _ = require('underscore'),
	Peer = require('./Peer'),
	Server = require('./peer_server'),
	DotMaker = require('./dotmaker'),
	utils = require('./utils'),
	fs = require('fs'),
	csv = require('csv');

var BASE_PORT = 7000;
var NUMBER_OF_PEERS = 50;
var NUMBER_OF_SEARCHES = 10;
var BASE_DELAY = 1000;
var FILES_PER_PEER = 10;

var MIN_SEARCH_TTL = 1;
var MAX_SEARCH_TTL = 5;


Peer.DEFAULT_TTL = 5;
var nextDelay = BASE_DELAY;

var peers = [];
var files = [];
var i = 0;
var a = 0;
var currentSearchTTL = MIN_SEARCH_TTL;
var currentSearchMethod = "searchFile";

initPeers();
helloPeer();



function initPeers() {
	

	var options = {'name': 'P', 'host':'localhost', 'port': BASE_PORT, "debug":true};

	initFiles();

	for (var i=0; i<NUMBER_OF_PEERS; i++) {
		options.name = 'P'+i;
		options.port = BASE_PORT+i;
		options.files = _.sample(files, FILES_PER_PEER);

		peers.push(new Peer(options));
	}
}



function initFiles() {
	files = fs.readdirSync(Peer.BASE_FILE_DIR);
	for(var i=0;i<files.length;i++) {
		files[i] = files[i];
	}
}

function helloPeer() {
	if (i!==0) {
		console.log("HELLO "+i);
		peers[i].sayHello('localhost', BASE_PORT+i-1);
	}
	i++;

	var next = i==NUMBER_OF_PEERS ? onAfterDiscovery : helloPeer;

	setTimeout(next,  BASE_DELAY*Math.ceil( (i+1)/10) );
	
}

function onAfterDiscovery() {
	//validatePeers();
	runFileSearch();
}

function startFileSearch() {
	a = 0;
	runFileSearch();
}

function runFileSearch()	{
	searchFile();
	
	a++;
	var next = a>=NUMBER_OF_SEARCHES ? saveRequestStats : runFileSearch;
	setTimeout(next,  BASE_DELAY );
}

function searchFile() {
	// Determine peer to search from
	var originPeer = _.sample(peers);

	var files = _.reduceRight(peers, function(a, p) {
		return a.concat(p.files);
	}, []);
	var validFiles = _.reject(files, function(f) {
		return _.contains(originPeer.files, f);
	});
	// Determine file to search for
	var filename = _.sample( validFiles );
	
	//Check if file is local, else search for it!
	if (!_.contains(originPeer.files, filename))	{
		console.log("----------------------------");
		console.log("Search for file "+filename+" from peer: "+originPeer.name);
		originPeer[currentSearchMethod](filename, null, currentSearchTTL);
	} else {
		console.log("ERROR: File is on origin peer");
	}
}

function saveRequestStats() {
	var recievedReport = "";
	for (var j=0; j<peers.length;j++) {
		var peer = peers[j];
		var report = peer.getPeerReport();
		var line = "";

		if (report.fileRequestMeter)	{
			line = peer.name + "," + report.fileRequestMeter.mean + "," + report.fileRequestMeter.count + "," + report.fileRequestMeter["1MinuteRate"] + "\r\n";
		} else {
			line = peer.name + ",0,0,0\r\n";
		}

		console.log("Report for "+peer.name+": "+JSON.stringify(report));
		console.log("Line: "+line);

		peer.stats.meter('fileRequestMeter').reset();

		recievedReport += line;
		
	}

	var date = new Date();
	var filename = './reports/' + date.getHours() + "-" + date.getMinutes() + "-" + date.getSeconds() + "-" + currentSearchMethod+"-TTL"+currentSearchTTL+'.csv';
	console.log("Saving CSV file: "+filename);
	
	fs.writeFile(filename, recievedReport, function(err) {
		if(err) {
			console.log(err);
		} else {
			console.log("The reports file was saved!");
		}
	});

	if (currentSearchTTL < MAX_SEARCH_TTL) {
		currentSearchTTL++;
		startFileSearch();
	} else if (currentSearchMethod == "searchFile") {
		currentSearchMethod = "searchKFile";
		currentSearchTTL = 1;
		startFileSearch();
	}
}

var filedir = null,
	fileCount = 1;

	
function validatePeers() {
	var dotmaker = new DotMaker();


	for(var i=0;i<NUMBER_OF_PEERS;i++) {
		
		var peer = peers[i];
		console.log("---------------------------------");
		console.log("Peer: "+peer);
		if (peer.plist().length == NUMBER_OF_PEERS - 1) {
			console.log("Known peers: Success! Number of known peers matches number of peers");
		} else {
			console.log("Known peers: Error! Peer only knows "+peer.plist().length+", it should have known "+(NUMBER_OF_PEERS-1));
		}

		console.log("Neighbors ("+peer.nlist().length+"/"+peer.capacity+"): " + peerlistToString(peer.nlist()));
		console.log("Most capable neighbor: "+peer.getMostCapableNeighbor().name+" capacity="+peer.getMostCapableNeighbor().capacity);

		dotmaker.addConnections(peer, peer.nlist());
	}


	console.log("---------------------------");
	
	if (!filedir) {
		filedir = dotmaker.generateFileDirectory();
	}
	var filename = filedir + "/dotfile_"+fileCount+".dot";

	console.log("Create dot file: "+filename);
	dotmaker.createDotFile(filename);

	fileCount++;

	// Call again later
	setTimeout(validatePeers, 60*1000);
}

function peerlistToString(list) {
	return "[" + _.reduce(list, function(memo, p, i) { return memo + p.port + (i==list.length-1?"":", "); }, "") + "]";
}



