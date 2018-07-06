function resubmitTestResponse() {
  
  // get previously submitted test response
  var form = FormApp.openById("1_UbOt0dCuM324WAgYHVTLKUUmbDBkbwX84pKbRXAL_0");
  var formResponse = form.getResponse("2_ABaOnuf8JiYQJ8oT204sEDOeTw-YNR-ylzsUoUfUK3QnzWU5EiiKeF69ZcCu");
  Logger.log("Resubmitting form response for: " + formResponse.getEditResponseUrl());
  
  // mock a resubmission
  var e = {};
  e.response = formResponse;
  
  // run onSubmit with mock resubmission
  onSubmit(e);
}

function onSubmit(e) {
  
  var secrets = getSecrets(); // in separate file
  var templateFileId = secrets["template_file_id"]; // link to [Template] doc
  var slackUrl = secrets["slack_incoming_webhook_url"]; // url to post to Slack
  var bitlyToken = secrets["bitly_token"];
  var bitlyGroupGuid = secrets["bitly_group_guid"];
  
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
    var dueDate = new Date().addDays(2); // voting closes in 2 days
    announceOnSlack(slackUrl, proposalTitle, bitlyUrl, dueDate);
  } else {
    var slacks = getOrganizerSlacks(newDoc); // hack since we have this method in post_results when reading from a document
    announceNotReadyOnSlack(slackUrl, proposalTitle, bitlyUrl, slacks);
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
  
  Logger.log("Ready to submit: " + isReadyToSubmit);
  
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
    body.insertParagraph(paragraphIndex, answer).setBold(false); // add answer
    body.insertParagraph(paragraphIndex, question).setBold(true); // add question
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

function announceOnSlack(slackUrl, proposalTitle, bitlyUrl, dueDate) {
  var dueDateStr = Utilities.formatDate(dueDate, "US/Pacific", "EEE, MMM d, YYYY, h:mm a 'Pacific Time'");
  
  var payload = {
    "username" : "proposal-bot",
    "icon_emoji": ":fist:",
    "link_names": 1
  };
  
  var announceText = "A new proposal has been posted!\n\n" +
              "*Name:* _" + proposalTitle + "_\n\n" +
              "*Comment period closes*: " + dueDateStr + "\n\n" +
              "*How can you participate in the proposal process?*\n\n" +
              "Head over to #proposals and follow the quick directions. I expect it’ll take less than 5 mins to read, comment (if you want), and vote on the proposal. Head to #proposal_inbox if you have any questions or problems.";
  
  var announcePayload = payload;
  announcePayload['text'] = announceText;
  announcePayload['channel'] = "#announcements",
  callAPI(slackUrl, announcePayload, "post");
  
  var proposalsText = "A new proposal has been posted!\n\n" +
      "Place your emoji vote (:+1: / :-1: / :stop:) on this post. Please do not comment in this channel. Comment in the *Comments* section at the bottom of the Google Doc linked below. Please head over to #proposal_inbox if you have any questions about this process.\n\n" +
        "*Name:* _" + proposalTitle + "_\n\n" + 
          "*Comment period closes:* " + dueDateStr + "\n\n" +
            "*Link to proposal:* " + bitlyUrl;
  
  var proposalsPayload = payload;
  proposalsPayload['text'] = proposalsText;
  proposalsPayload['channel'] = "#proposals",
  callAPI(slackUrl, proposalsPayload, "post");
}

function announceNotReadyOnSlack(slackUrl, proposalTitle, bitlyUrl, slacks) {
  
  var payload = {
    "username" : "proposal-bot",
    "icon_emoji": ":fist:",
    "link_names": 1,
    "channel" : "#proposal_inbox",
    "text": "@channel Someone posted a proposal but would like some help before announcing it officially.\n\n" +
             "*Name:* _" + proposalTitle + "_\n\n" +
              "*Link to tentative proposal:* " + bitlyUrl
  };
  
  if (slacks.length > 0) {
    payload["text"] += "\n\n*Organizers:* " + slacks.join(" ");
  }
  
  callAPI(slackUrl, payload, "post");
}
