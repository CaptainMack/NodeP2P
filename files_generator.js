var _ = require('underscore'),
	fs = require('fs'),
	utils = require('./utils'),
	Faker = require('./libs/Faker.js');

var NUMBER_OF_FILES = 100;
var BASE_DIR = "./peer_files";


for (var i=0;i<NUMBER_OF_FILES;i++) {

	var filename = BASE_DIR + "/" + utils.guid() + ".txt";
	var content = "COMPANY: "+Faker.Company.companyName()+" -- "+Faker.Company.catchPhrase();

	fs.writeFile(filename, content, function(err) {
		if(err) {
			console.log(err);
		} else {
			console.log("["+i+"] The file was saved: "+filename);
		}
	});
}