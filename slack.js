function callSlackWebAPI(apiMethod, httpMethod) {
  var secrets = getSecrets();
  var url = "https://slack.com/api/" + apiMethod + "&token=" + secrets["slack_token"];
  var http = callAPI(url, {}, httpMethod);
  var txt = http.getContentText();
  var json = JSON.parse(txt);
  return(json);
}

function callAPI(url, payload, httpMethod) {
   var options =  {
    "method" : httpMethod,
    "contentType" : "application/json",
    "payload" : JSON.stringify(payload)
  };
  var http = UrlFetchApp.fetch(url, options);
  return(http);
}
