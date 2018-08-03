function resubmitLastResponse() {
  
  var config = getConfig();
  var formId = config["form_id"];
  var form = FormApp.openById(formId);
  
  // get most recently submitted response
  var responses = form.getResponses();
  var formResponse = responses[responses.length - 1];
  Logger.log(formResponse.getId());
  Logger.log(formResponse.getEditResponseUrl());
  
  // run onSubmit with mock resubmission
  var e = {"response": formResponse};
  onSubmit(e);
}

function resubmitTestResponse() {
  
  var config = getConfig();
  var formId = config["form_id"];
  var testResponseId = config["test_response_id"];
  var form = FormApp.openById(formId);
  
  // get test response
  var formResponse = form.getResponse(testResponseId);
  Logger.log(formResponse.getId());
  Logger.log(formResponse.getEditResponseUrl());
  
  // run onSubmit with mock resubmission
  var e = {"response": formResponse};
  onSubmit(e);
}

function onSubmit(e) {
  
  var config = getConfig(); // in separate file
  var templateFileId = config["template_file_id"]; // link to [Template] doc
  var bitlyToken = config["bitly_token"];
  var bitlyGroupGuid = config["bitly_group_guid"];
  var votingDays = config["voting_days"];
  
  var formResponse = e.response;
  
  // get proposal title
  var proposalTitle = getProposalTitle(formResponse);
  
  // copy proposal template to new doc
  var newFile = copyTemplateFile(templateFileId);
  var newId = newFile.getId();
  var newUrl = newFile.getUrl();
  var newDoc = DocumentApp.openById(newId);
  
  // put proposal in new doc
  insertProposalTitle(newDoc, proposalTitle);
  insertProposalText(newDoc, formResponse);
  insertProposalOrganizerEmails(newDoc, formResponse);
  
  // announce on Slack
  var bitlyUrl = getBitlyUrl(bitlyToken, bitlyGroupGuid, newUrl);
  var isReady = isReadyToSubmit(formResponse);
  if (isReady) {
    var dueDate = new Date().addDays(votingDays);
    announceOnSlack(proposalTitle, bitlyUrl, dueDate);
  } else {
    var slacks = getOrganizerSlacks(newDoc); // hack since we have this method in post_results when reading from a document
    var editUrl = formResponse.getEditResponseUrl();
    var bitlyEditUrl = getBitlyUrl(bitlyToken, bitlyGroupGuid, editUrl);
    announceNotReadyOnSlack(proposalTitle, bitlyUrl, bitlyEditUrl, slacks);
  }
}

Date.prototype.addDays = function(days) {
  // source: https://stackoverflow.com/a/563442
  var dat = new Date(this.valueOf());
  dat.setDate(dat.getDate() + days);
  return dat;
}

function isReadyToSubmit(formResponse) {
  var isReadyToSubmit = false; // default to not ready
  var itemResponses = formResponse.getItemResponses();
  
  // get ready-to-submit form response if there is one
  itemResponses = itemResponses.filter(function(r) {return r.getItem().getTitle().length > 0 &&
                                                            r.getResponse().length > 0 &&
                                                              r.getItem().getTitle().toLowerCase().indexOf("are you ready to submit a final version") !== -1;
                                                   });
 
  if (itemResponses.length > 0)
  {
    var itemResponse = itemResponses[0]; // if somehow there are multiple, only use first
    isReadyToSubmit = itemResponse.getResponse().toLowerCase().trim() === "yes";
  }
  
  console.log("Ready to submit: " + isReadyToSubmit);
  
  return(isReadyToSubmit);
  
}

function copyTemplateFile(templateFileId) {
  var templateFile = DriveApp.getFileById(templateFileId);
  var newFile = templateFile.makeCopy("Untitled");
  newFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);
  return(newFile);
}

function getProposalTitle(formResponse) {
  // title must be first answer
  var proposalTitle = "Untitled";
  var itemResponses = formResponse.getItemResponses();
  var firstAnswer = itemResponses[0].getResponse();
  if (firstAnswer.length > 0) {
    proposalTitle = firstAnswer;
  }
  return(proposalTitle);
}

function insertProposalTitle(doc, proposalTitle) {
  // replace file title
  doc.setName("Accepting Comments: " + proposalTitle);
  
  // replace title heading
  var body = doc.getBody();
  body.replaceText("Proposal Title", proposalTitle);
}

function insertProposalText(doc, formResponse) {
  // get proposal placeholder text
  var placeholderRegex = "\\[insert proposal here\\]";
  var body = doc.getBody();
  var element = body.findText(placeholderRegex).getElement();
  var paragraph = element.getParent();
  var paragraphIndex = body.getChildIndex(paragraph);
  
  // remove placeholder paragraph
  paragraph.removeFromParent();

  // exclude the first item response (it's the proposal title)
  var itemResponses = formResponse.getItemResponses().slice(1);
  
  // only use filled in questions and answers
  itemResponses = itemResponses.filter(function(r) {return r.getItem().getTitle().length > 0 && r.getResponse().length > 0;});

  // insert in reverse order (due to how insert works)
  itemResponses = itemResponses.reverse();

  for (var i = 0; i < itemResponses.length; i++) {
    var itemResponse = itemResponses[i];
    var question = itemResponse.getItem().getTitle();
    var answer = itemResponse.getResponse();
    if (i > 0) {
      body.insertParagraph(paragraphIndex, ""); // add empty space unless it's the first response
    }
    body.insertParagraph(paragraphIndex, answer).setBold(false); // add answer (not bold)
    body.insertParagraph(paragraphIndex, question).setBold(true); // add question (bold)
  }
}

function insertProposalOrganizerEmails(doc, formResponse) {
  var itemResponses = formResponse.getItemResponses();
  
  // get end of emails template text
  var placeholderRegex = "\\[end emails\\]";
  var body = doc.getBody();
  var element = body.findText(placeholderRegex).getElement();
  var paragraph = element.getParent();
  var paragraphIndex = body.getChildIndex(paragraph);
  
  // get emails form response if there is one
  itemResponses = itemResponses.filter(function(r) {return r.getItem().getTitle().length > 0 &&
                                                            r.getResponse().length > 0 &&
                                                              r.getItem().getTitle().toLowerCase().indexOf("emails of all organizers") !== -1;
                                                   });
  
  if (itemResponses.length > 0)
  {
    var itemResponse = itemResponses[0]; // if somehow there are multiple, only use first
    var question = itemResponse.getItem().getTitle();
    var answer = itemResponse.getResponse();
    // insert blank
    body.insertParagraph(paragraphIndex, "");
    // insert emails
    body.insertParagraph(paragraphIndex, answer);
  }
}

function getBitlyUrl(bitlyToken, bitlyGroupGuid, url) {
  var payload = {
    "long_url": url,
    "group_guid": bitlyGroupGuid
  };
  var options =  {
    "headers": {
      "content-type" : "application/json",
      "authorization" : "Bearer " + bitlyToken
    },
    "method": "post",
    "payload" : JSON.stringify(payload)
  };
  var http = UrlFetchApp.fetch("https://api-ssl.bitly.com/v4/shorten", options);
  var text = http.getContentText();
  var bitlyUrl = JSON.parse(text)["id"];
  return(bitlyUrl);
}

function announceOnSlack(proposalTitle, bitlyUrl, dueDate) {
  
  var config = getConfig();
  var announcementsChannelName = config["announcements_channel_name"];
  var proposalsChannelName = config["proposals_channel_name"];
  var inboxChannelName = config["inbox_channel_name"];
  
  var dueDateStr = Utilities.formatDate(dueDate, "US/Pacific", "EEE, MMM d, YYYY, h:mm a 'Pacific Time'");

  // post to announcements channel
  
  var announcementsText = "A new proposal has been posted!\n\n" +
              "*Name:* _" + proposalTitle + "_\n\n" +
               "*Comment period closes*: " + dueDateStr + "\n\n" +
                "*How can you participate in the proposal process?*\n\n" +
                 "Head over to #" + proposalsChannelName + " and follow the quick directions. I expect it’ll take less than 5 mins to read, comment (if you want), and vote on the proposal. " +
                  "Head to #" + inboxChannelName + " if you have any questions or problems.";
  
  var announcementsApiMethod = "chat.postMessage" +
    "?link_names=1" +
      "&text=" + encodeURIComponent(announcementsText) +
        "&channel=" + encodeURIComponent(announcementsChannelName);
  
  callSlackWebAPI(announcementsApiMethod, "post");
  
  // post to proposals channel
  
  var proposalsText = "A new proposal has been posted!\n\n" +
      "Place your emoji vote (:+1: / :-1: / :stop:) on this post. Please do not comment in this channel. Comment in the *Comments* section at the bottom of the Google Doc linked below. " +
        "Please head over to #" + inboxChannelName + " if you have any questions about this process.\n\n" +
         "*Name:* _" + proposalTitle + "_\n\n" + 
          "*Comment period closes:* " + dueDateStr + "\n\n" +
           "*Link to proposal:* " + bitlyUrl;
  
  var proposalsApiMethod = "chat.postMessage" +
    "?link_names=1" +
      "&text=" + encodeURIComponent(proposalsText) +
        "&channel=" + encodeURIComponent(proposalsChannelName);
  
  callSlackWebAPI(proposalsApiMethod, "post");
}

function announceNotReadyOnSlack(proposalTitle, bitlyUrl, bitlyEditUrl, slacks) {
  
  var config = getConfig();
  var inboxChannelName = config["inbox_channel_name"];
  var inboxText = "@channel Someone posted a proposal but would like some help before announcing it officially.\n\n" +
             "*Name:* _" + proposalTitle + "_\n\n" +
              "*Link to tentative proposal:* " + bitlyUrl + "\n\n" +
               "*Link to edit and resubmit:* " + bitlyEditUrl;
  
  if (slacks.length > 0) {
    inboxText += "\n\n*Organizers:* " + slacks.join(" ");
  }
  
  var inboxApiMethod = "chat.postMessage" +
    "?link_names=1" +
      "&text=" + encodeURIComponent(inboxText) +
        "&channel=" + encodeURIComponent(inboxChannelName);
  
  callSlackWebAPI(inboxApiMethod, "post");
}
