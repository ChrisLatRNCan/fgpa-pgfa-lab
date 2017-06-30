angular.module("myApp", ['schemaForm']).controller("myCtrl", function ($scope) {

$scope.schema = {
  type: "object",
  properties: {
        "version": { "title": "version", "type": "string", "enum": [ "2.0" ], "description": "The schema version used to validate the configuration file.  The schema should enumerate the list of versions accepted by this version of the viewer." },
        "language": { "title": "language", "type": "string", "enum": [ "en", "fr", "es" ], "description": "ISO 639-1 code indicating the language of strings in the schema file" }
  }
};
 $scope.form = [
    "version",
    "language"
];

    $scope.model = {};
});