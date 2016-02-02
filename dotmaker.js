var _ = require('underscore'),
	fs = require('fs');

function DotMaker() {
	this.peers = [];
	this.connections = [];
}

DotMaker.prototype.addConnections = function(peer, connections){
	var self = this,
		pname = self.peerToString(peer);
	
	_.each(connections, function(p) {
		var name = self.peerToString(p);
		self.addConnection(pname, name);
	});
};

DotMaker.prototype.addConnection = function(from, to) {
	if (!_.contains(this.peers, from)) {
		this.peers.push(from);
	}

	if (!_.contains(this.peers, to)) {
		this.peers.push(to);
	}
	var isAdded = false;

	for (var i=0;i<this.connections.length;i++) {
		var p1 = this.connections[i][0],
			p2 = this.connections[i][1];
		
		if ( p1 == from && p2 == to || p1 == to && p2 == from ) {
			isAdded = true;
			break;
		}
	}

	if (!isAdded) {
		this.connections.push([from, to]);
	}
};

DotMaker.prototype.getDotString = function() {
	var br = "\n",
		string = "";

	string += "graph network {" + br;

	// List peers
	for (var i=0;i<this.peers.length;i++) {
		string += '      "'+this.peers[i]+'";' + br;
	}

	// List connections
	for (var j=0;j<this.connections.length;j++) {
		string += '      "'+this.connections[j][0]+'" -- "'+this.connections[j][1]+'";' +br;
	}

	string += "}" + br;

	return string;
};

DotMaker.prototype.createDotFile = function(filename) {
	
	filename = filename;

	fs.writeFile(filename, this.getDotString(), function(err) {
		if(err) {
			console.log(err);
		} else {
			console.log("The file was saved!");
		}
	}); 
};


DotMaker.prototype.peerToString = function(peer) {
	return peer.name+"("+peer.capacity+")";
};


DotMaker.prototype.generateFileDirectory = function() {
	var d = new Date();
	var filedir = "./dot_files/"+d.getDate()+"-"+d.getMonth()+"-"+d.getFullYear()+"-"+d.getHours()+"-"+d.getMinutes()+"-"+d.getSeconds();

	if (!fs.existsSync(filedir)) {
		fs.mkdirSync(filedir);
	}

	return filedir;
};

module.exports = DotMaker;