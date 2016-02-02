var Utils = {
  s4: function() {
    return Math.floor((1 + Math.random()) * 0x10000)
               .toString(16)
               .substring(1);
  },

  guid: function() {
    return this.s4() + this.s4() + '-' + this.s4() + '-' + this.s4() + '-' +
           this.s4() + '-' + this.s4() + this.s4() + this.s4();
  },

  powerLawRandom: function(from, to) {
    var n = -1.1, // Distribution
        r = Math.random();
    return Math.floor(Math.pow( ((Math.pow(to+1, n+1) - Math.pow(from, n+1)) * r + Math.pow(from, n+1)), (1/(n+1)) ));
  }

};

module.exports = Utils;