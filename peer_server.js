var xmlrpc = require('xmlrpc'),
    _ = require('underscore'),
    utils = require('./utils'),
    checksum = require('checksum'),
    csv = require('csv');
var peers = [];
var recievedReport;  
var callbackNum = 0;

function Server(pList) {

  // Invokes with new if called without
  if (false === (this instanceof Server)) {
    return new Server();
  }
  var self = this;
  peers = pList;
  this.initServer();
  console.log("Server started");
}

Server.prototype.initServer = function() {
  var self = this;
  var server = xmlrpc.createServer({host:'localhost', port:3070});
};

Server.prototype.getStats = function getStats() {
	   params = {};
	 for(var i=0; i<peers.length; i++)	{
	 	this.getPeerReport('requestPeerReport', {host: peers[i].host, port: peers[i].port}, params);
	 }
};

Server.prototype.getPeerReport = function(method, peer, params) {
  // Setup params
  if (!params) {
    params = {};
 }
 
  var options = {
    host:peer.host,
    port:peer.port,
    path: '/'
  };
  var client = xmlrpc.createClient(options);
  client.methodCall(method, [params], function (error, report) {
	  	callbackNum++;
	  	//{"mean":4.109101498042515,"count":127,"currentRate":0,"1MinuteRate":1.338833250390382,"5MinuteRate":0.3862577134714373,"15MinuteRate":0.13686476651229976}
	    //csv().from(JSON.stringify(report.name) + "," + JSON.stringify(report.report.fileRequestPerSecond.mean) + "\r\n").to('./fileReport.csv')
	    if (typeof report.report.fileRequestPerSecond != 'undefined')	{
			recievedReport += JSON.stringify(report.name) + "," + JSON.stringify(report.report.fileRequestPerSecond.mean) + "," + JSON.stringify(report.report.fileRequestPerSecond.count) + "," + JSON.stringify(report.report.fileRequestPerSecond["1MinuteRate"]) + "\r\n";
		    console.log(JSON.stringify(report.report.fileRequestPerSecond));
	    }
	    if (callbackNum >= peers.length)	{
	      console.log("Saving CSV file");
	      var date = new Date();
	      csv().from(recievedReport).to('./' + date.getHours() + "-" + date.getMinutes() + "-" + date.getSeconds() + "-" + date.getMilliseconds() + '/report.csv');
	      callbackNum = 0;
	      recievedReport = '';
	    }
    });
};


Server.prototype.log = function log(string) {
  var date = new Date(),
      dateString = date.getHours()+":"+date.getMinutes()+":"+date.getSeconds(); 
  
  console.log("["+dateString+"][SERVER] "+string);
};

module.exports = Server;
