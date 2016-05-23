var MavenUtils = function () {

	var _ = require('underscore'),
		$ = require('jquery'),
		fs = require('fs'),
		common = require('./common'),
		ui = require('./ui-utils'),
		file = require('./file-utils');

	return {
		workspacePoms: [],
		pomFileName: 'pom.xml',
		targetFileName: 'target',
		settings: common.fileSeparator + "conf" + common.fileSeparator + "settings.xml",
		repo: common.homeDir + common.fileSeparator + ".m2" + common.fileSeparator + "repository" + common.fileSeparator,

		/* Scans the users PATH for the presence of Maven to determine where the
		 * global settings.xml file is located.
		 */
		getMavenGlobalSettings: function () {
			var self = this,
				path = (common.isWin) ? process.env.Path : process.env.PATH,
				mavenElems = $(path.split(common.pathSeparator)).filter(function () {
					return this.match(/^.*maven.*$/g);
				}),
				settingsFileLocation = "";
			if (mavenElems.length > 0) {
				var e = mavenElems[0];
				settingsFileLocation = (e.endsWith("bin")) ? e.replace("bin", self.settings) : e.concat(self.settings);
			} else {
				ui.addPlainMessage("Maven has not been found on the PATH, please ensure that Maven has been installed.", "warning");
			}
			return settingsFileLocation;
		},


		/* Given the location of the maven settings.xml, the file is read with node
		 * fs, jquery then parses the xml and extracts the localRepository.
		 */
		findMavenRepoInSettings: function (settingsFileLocation, callback) {
			var self = this;
			fs.readFile(settingsFileLocation, "utf8", (err, content) => {
				var repo = self.findInXml(content, "localRepository", false);
				if (repo)
					self.repo = (repo.text().endsWith(common.fileSeparator)) ? repo.text() : repo.text().concat(common.fileSeparator);
				callback();
			});
		},


		/* Checks maven settings for a localRepository which deviates from the maven
		 * default.
		 * User settings take priority:
		 * 			${user.home}/.m2/settings.xml
		 * Global settings are used if no user settings are found:
		 * 			${maven.home}/conf/settings.xml
		 * If a localRepository is not present in either the user or global settings,
		 * use the default repository:
		 * 			${user.home}/.m2/repository
		 */
		setMavenRepo: function (callback) {

			var hasUserSettings = true,
				hasGlobalSettings = true,
				hasCustomRepo = false,
				globalSettingsLocation = this.getMavenGlobalSettings(),
				settingsFileLocation = common.homeDir + common.fileSeparator + ".m2" + common.fileSeparator + "settings.xml";

			// Check if user settings are present
			hasUserSettings = file.fileExists(settingsFileLocation, false);
			// if not, check if global settings are present
			if (!hasUserSettings) {
				settingsFileLocation = globalSettingsLocation;
				hasGlobalSettings = file.fileExists(settingsFileLocation, false);
			}

			// If either user or global settings have been found, check if a maven repo has been configured.
			if (hasUserSettings || hasGlobalSettings) {
				this.findMavenRepoInSettings(settingsFileLocation, () => {
					// For lazyness, ensure the repo ends with a file separator so I dont have to bother adding one later on.
					if (!this.repo.endsWith(common.fileSeparator)) {
						this.repo = this.repo.concat(common.fileSeparator);
					}
					callback();
				});
			} else {
				callback();
			}
		},

		isPom: function (file, self) {
			if (self) self = this;
			return (file.path.indexOf(self.targetFileName) < 0 && file.path.endsWith(self.pomFileName));
		},

		addPoms: function (file, self, callback) {

			var promise = atom.workspace.scan(/\<project.*maven/g, (pom) => {
				var newpom = require('./pom-factory').getInstance(pom.filePath, callback);
				self.workspacePoms.push(newpom);
			});

		},

		getPoms: function (callback) {
			var rootDirectories = atom.workspace.project.getDirectories(),
				self = this;

			self.setMavenRepo(() => {
				$.each(rootDirectories, (index, elem) => {
					self.addPoms(elem, self, callback);
				});
			});

		},

		getDependencyNotFoundMessage: function (dependency) {
			return dependency.groupId + ":" + dependency.artifactId + ":" +
				dependency.version + ":" + dependency.type +
				" could not be found in the local repository.";
		},

		findInXml: function (xml, selector, children, pom) {
			var result;
			try {
				result = $($.parseXML(xml)).find(selector);
			} catch (err) {
				console.error(err);
				ui.addLineMessage("Invalid XML Document", null, null, (pom) ? pom.pomPath : null, "error");
			}
			return (result && children) ? result.children() : result;
		},

		isInWorkspace: function (gavt) {
			var returning = {};
			$.each(this.workspacePoms, (index, elem) => {
				if (elem.equals(gavt)) {
					returning = elem;
					return false;
				}
			})
			return returning;
		}

	};

};

module.exports = MavenUtils();