
// Testing Power Law
var utils = require('./utils');

// x = [(x1^(n+1) - x0^(n+1))*y + x0^(n+1)]^(1/(n+1))

var x0 = 1, // Interval start
	x1 = 10, // Interval end
	counts = [];

for (var i=x0;i<=x1;i++) {
	counts[i] = 0;
}

var RUNTIME = 1000;

for (var j=0;j<RUNTIME;j++) {

	var x = utils.powerLawRandom(x0, x1);

	counts[x]++;

}

console.log("Has calculated. Spread: "+counts.length);
for (var k=x0;k<=x1;k++) {
	console.log("Capacity: "+k+" was "+counts[k]);
}

