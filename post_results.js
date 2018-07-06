function processProposals() {
  var nowPacificStr = Utilities.formatDate(new Date(), "US/Pacific", "EEE, MMM d, YYYY, h:mm a");
  var nowPacificTime = new Date(nowPacificStr);
  
  var messages = getProposalsChannelMessages();
  var results = getResultsToPost(messages, nowPacificTime);
  postResults(results);
}

function getProposalsChannelMessages() {
  var proposalsChannelName = "proposals";
  
  var channels = callSlackWebAPI("channels.list?exclude_members=true", "get")["channels"];
  var proposalsChannelId = channels.filter(function(c) {return c["name"] === proposalsChannelName})[0]["id"];
  
  var messages = callSlackWebAPI("channels.history?channel=" + proposalsChannelId, "get")["messages"];
  return(messages);
}

function getResultsToPost(messages, referenceDate) {
  // restrict to messages with voting due date
  var messages = getMessagesThatHaveVotingDueDates(messages);
  
  // and due date must be in past
  messages = messages.filter(function(m) {return m.dueDate < referenceDate;});
  
  // and proposal bot must not have commented on it yet
  messages = messages.filter(
    function(m) {
      return !(m.replies && m.replies.some(function(r) {return r.user === "B00";}))
    });
  
  // get results for each qualified message
  var resultsToPost = [];
  for (var i = 0; i < messages.length; i++) {
    var votes = parseVotes(messages[i]["reactions"]);
    var results = processVotes(votes);
    var sentence = convertResultsToSentence(results);
    var ts = messages[i]["ts"]; // timestamp represents message when threading
    resultsToPost[i] = {"thread_ts": ts, "votes": votes, "results": results, "sentence": sentence};
    
    // add proposal doc info
    var doc = getProposalDoc(messages[i]);
    if (doc !== undefined) {
      resultsToPost[i]["doc"] = doc;
      resultsToPost[i]["slacks"] = getOrganizerSlacks(doc);
    }
  }
  return(resultsToPost);
}

function getMessagesThatHaveVotingDueDates(messages) {
  var dueDateRegex = "\\*Comment period closes:\\* (.+) Pacific Time";
  var messagesWithDueDates = [];
  
  for (var i = 0; i < messages.length; i++) {
    var dueDateMatch = messages[i]["text"].match(dueDateRegex);
    if (dueDateMatch !== null) {
      var dueDateStr = dueDateMatch[1];
      var dueDate = new Date(dueDateStr); // Google Apps Scripts can't handle time zones with new Date: https://issuetracker.google.com/issues/36757698
      messages[i]["dueDate"] = dueDate;
      messagesWithDueDates.push(messages[i]);
    }
  }
  return(messagesWithDueDates);
}

function parseVotes(reactionsArr) {
  // initialize vote count
  var votes = {yes: 0, no: 0, stop: 0};
  
  // if no reactions then there were no votes
  if (reactionsArr === undefined)
    return votes;

  // for each reaction type, increment vote count accordingly
  // note that if an individual votes yes for several skin tones, they will be counted multiple times
  // but this has not been an issue so far
  for (var i = 0; i < reactionsArr.length; i++) {
    var reactionType = reactionsArr[i];
    var reactionName = reactionType["name"];
    var reactionCount = reactionType["count"];

    // votes for yes begin with +1 for all skin tones
    // or contain thumbsup
    if (reactionName.substr(0, 2) === "+1"
        || reactionName.toLowerCase().indexOf("thumbsup") !== -1) {
      votes["yes"] += reactionCount;

    // votes for no begin with -1 for all skin tones
    // or contain thumbsdown
    } else if (reactionName.substr(0, 2) === "-1"
               || reactionName.toLowerCase().indexOf("thumbsdown") !== -1) {
      votes["no"] += reactionCount;

    // votes for stop must use stop or octagonal_sign emoji
    } else if (["stop", "octagonal_sign"].indexOf(reactionName.toLowerCase()) !== -1) {
      votes["stop"] += reactionCount;
    }
  }

  return(votes);
}

function processVotes(votes) {
  if (
    typeof(votes["yes"]) !== "number"
    || typeof(votes["no"]) !== "number"
    || typeof(votes["stop"]) !== "number"
  ) {
    throw new Error("Invalid yes, no, or stop vote counts");
  }
  
  var yesVotes = votes["yes"];
  var noVotes = votes["no"];
  var stopVotes = votes["stop"];
  var totalVotes = yesVotes + noVotes + stopVotes;
  var votesToApprove = Math.floor(totalVotes * 0.5) + 1;
  
  if (stopVotes >= 1) {
    return("stop");
  }
  
  if (yesVotes >= votesToApprove) {
    return("approve");
  }
  
  return("fail");
}

function convertResultsToSentence(results) {
  var sentence;

  if (results === "approve") {
    sentence = "Approved!";

  } else if (results === "fail") {
    sentence = "The proposal failed.";

  } else if (results === "stop") {
    sentence = "The proposal has been stopped. We are confirming the objection is grounded in our official documents and if so, whether it can be resolved."
  }

  return(sentence);
}

function getProposalDoc(message) {

  var urlRegex = "\\*Link to proposal:\\* <*([^\\|]+)";
  var urlMatch = message["text"].match(urlRegex);
  
  if (urlMatch !== null) {
    var url = urlMatch[1];
    // if url is bitly, get url from redirect
    if (url.indexOf("bit.ly") !== -1) {
      url = UrlFetchApp.fetch(url, {followRedirects: false}).getAllHeaders()["Location"];
    }
    var doc = DocumentApp.openByUrl(url);
    return(doc);
  }
}

function getOrganizerSlacks(doc) {

  // from https://gist.github.com/gswalden/27ac96e497c3aa1f3230
  var slack_re = /^@[a-z0-9][a-z0-9._-]*$/;
  var slacks = [];
  
  var body = doc.getBody();
  var text = body.getText();
  var matchArr = text.match("Slacks of all organizers.*\n(.+)");
  if (matchArr !== null) {
    match = matchArr[1];
    match = match.replace(/[, ]/g, "\n"); // in case of a comma or space delimited list, replace with new line
    var lines = match.split("\n");
    
    for (var i = 0; i < lines.length; i++) {
      var slack = lines[i].trim();
      if (slack_re.test(slack) && slacks.indexOf(slack) === -1) {
        slacks.push(slack);
      }
    }
  }
  return(slacks);
}

function postResultsInDoc(doc, resultsStr) {
  var body = doc.getBody();
  
  var newHeader = body.insertParagraph(1, "Results");
  newHeader.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  
  var resultsStrForDoc = Utilities.formatDate(new Date(), "US/Pacific", "M/d/YY") +
    ": " +
      resultsStr;   
  
  var newText = body.insertParagraph(2, resultsStrForDoc);
  newText.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  
  // hacks
  var proposalTitle = body.getChild(0).getText();
  var resultsForTitle;
  if (resultsStr.toLowerCase().indexOf("approved") !== -1) {
    resultsForTitle = "Approved";
  } else if (resultsStr.toLowerCase().indexOf("failed") !== -1) {
    resultsForTitle = "Failed";
  } else if (resultsStr.toLowerCase().indexOf("stopped") !== -1) {
    resultsForTitle = "Stopped";
  }
 
  doc.setName(resultsForTitle + ": " + proposalTitle);
}

function disableEditAccess(doc) {
  var id = doc.getId();
  var file = DriveApp.getFileById(id);
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.EDIT);
}

function postResults(results) {
  results.forEach(function(e) {
    var slackResultsStr = "*" + e.sentence + "*" +
      " (" + e.votes["yes"] + " yes, " + e.votes["no"] + " no, " + e.votes["stop"] + " stop)";
    var slackMessage = (slackResultsStr + " " + e.slacks.join(" ")).trim();
    var apiMethod = "chat.postMessage" +
      "?username=proposal-bot" +
        "&icon_emoji=" + encodeURIComponent(":fist:") +
          "&link_names=1" +
            "&thread_ts=" + e.thread_ts +
              "&text=" + encodeURIComponent(slackMessage) +
                "&channel=" + encodeURIComponent("#proposals");
    callSlackWebAPI(apiMethod, "post");
    
    if (e["doc"] !== null) {
      var doc = e["doc"];
      postResultsInDoc(doc, slackResultsStr.replace(/\*/g, ""));
      disableEditAccess(doc);
    }
    
    Logger.log([e.thread_ts, slackMessage].join(": "));
  });
}
