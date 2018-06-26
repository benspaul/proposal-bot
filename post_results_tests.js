function runTests() {
  var testsArr = getTests();
  var testResults = [];
  for (t in testsArr) {
    var testResult = testsArr[t]();
    testResults.push(testResult);
  }
  Logger.log("\n" + testResults.join("\n"));
}

function assertEqual(actual, expected, testName) {
  // if test passes print "✔ formatted test name"
  // if test fails print "❌ formatted test name expected A, got B"
  var actualStr = JSON.stringify(actual);
  var expectedStr = JSON.stringify(expected);
  var passes = actualStr === expectedStr;
  var resultsChar = passes ? "✔" : "❌";
  var formattedTestName = " " + testName.replace(/(test_)/g, "").replace(/_/g, ", ").replace(/([a-z])([A-Z0-9])/g, "$1 $2").toLowerCase();
  var description = passes ? "" : " expected " + expectedStr + ", actual " + actualStr;
  var testResultsStr = resultsChar + formattedTestName + description;
  return(testResultsStr);
}

function getTests() {

  var testsArr = [

    function Given5Yes5No0Stop_WhenProcessVotes_ThenProposalFailed() {
      // given 5 Yes, 5 No, 0 Stop votes
      var votes = {yes: 5, no: 5, stop: 0};
      
      // when we run processVotes
      var results = processVotes(votes);
      
      // it indicates that the proposal failed (we needed Yes for 50% + 1 of all votes but only got 50%)
      return assertEqual(results, "fail", arguments.callee.name);
    },

    function Given6Yes5No0Stop_WhenProcessVotes_ThenProposalApproved() {
      // given 6 Yes, 5 No, 0 Stop votes
      var votes = {yes: 6, no: 5, stop: 0};
      
      // when we run processVotes
      var results = processVotes(votes);
      
      // it indicates that the proposal approved (we hit the required Yes for 50% + 1 of all votes)
      return assertEqual(results, "approve", arguments.callee.name);
    },

    function Given6Yes5No1Stop_WhenProcessVotes_ThenProposalStopped() {
      // given 6 Yes, 5 No, 1 Stop votes
      var votes = {yes: 6, no: 5, stop: 1};
      
      // when we run processVotes
      var results = processVotes(votes);
      
      // it indicates that the proposal is stopped (any proposal with a Stop vote is stopped until it is adjudicated)
      return assertEqual(results, "stop", arguments.callee.name);
    },

    function Given0Yes0No1Stop_WhenProcessVotes_ThenProposalStopped() {
      // given 0 Yes, 0 No, 1 Stop votes
      var votes = {yes: 0, no: 0, stop: 1};
      
      // when we run processVotes
      var results = processVotes(votes);
      
      // it indicates that the proposal is stopped (any proposal with a Stop vote is stopped until it is adjudicated)
      return assertEqual(results, "stop", arguments.callee.name);
    },

    function Given0Yes0No0Stop_WhenProcessVotes_ThenProposalFailed() {
      // given 0 Yes, 0 No, 0 Stop votes
      var votes = {yes: 0, no: 0, stop: 0};
      
      // when we run processVotes
      var results = processVotes(votes);
      
      // it indicates that the proposal failed (it did not hit 50% + 1 of all votes)
      return assertEqual(results, "fail", arguments.callee.name);
    },

    function GivenNullYesNullNoNullStop_WhenProcessVotes_ThenThrowError() {
      // given null Yes, null No, null Stop votes
      var votes = {
        yes: null,
        no: null,
        stop: null
      };
      
      // when we run processVotes
      try {
        processVotes(votes)
      } catch (e) {
        var errorMsg = e.message;
      }
      
      // then it throws an error saying they are invalid
      finally {
        return assertEqual(errorMsg, "Invalid yes, no, or stop vote counts", arguments.callee.name);
      }
      return true;
    },

    function GivenResultIsApprove_WhenConvertResultsToSentence_ThenSentenceContainsApproved() {
      // given result is "approve"
      var results = "approve";

      // when we run convertResultsToSentence
      var sentence = convertResultsToSentence(results);

      // then sentence contains "approved"
      var containsStr = sentence.toLowerCase().indexOf("approved") !== -1;
      return assertEqual(containsStr, true, arguments.callee.name);
    },

    function GivenResultIsFail_WhenConvertResultsToSentence_ThenSentenceContainsFailed() {
      // given result is "fail"
      var results = "fail";

      // when we run convertResultsToSentence
      var sentence = convertResultsToSentence(results);

      // then sentence contains "failed"
      var containsStr = sentence.toLowerCase().indexOf("failed") !== -1;
      return assertEqual(containsStr, true, arguments.callee.name);
    },

    function GivenResultIsStop_WhenConvertResultsToSentence_ThenSentenceContainsStopped() {
      // given result is "stop"
      var results = "stop";

      // when we run convertResultsToSentence
      var sentence = convertResultsToSentence(results);

      // then sentence contains "stopped"
      var containsStr = sentence.toLowerCase().indexOf("stopped") !== -1;
      return assertEqual(containsStr, true, arguments.callee.name);
    },

    function GivenReactions5Yes4No3Stop_AndSameSkinToneReactions_WhenParseVotes_ThenVotesAreCorrect() {
      // given reactions of 5 yes, 4 no, 3 stop with same skin tone reactions
      var reactions = [{name: "+1", count: 5}, {name: "-1", count: 4}, {name: "stop", count: 3}];

      // when we run parseVotes
      var votes = parseVotes(reactions);

      // then votes are correct
      return assertEqual(votes, {yes: 5, no: 4, stop: 3}, arguments.callee.name);
    },

    function GivenReactions5Yes4No3Stop_AndDifferentSkinToneReactions_WhenParseVotes_ThenVotesAreCorrect() {
      // given reactions of 5 yes, 4 no, 3 stop with different skin tone reactions
      var reactions = [ // yes (5 total)
                        {name: "thumbsup_all", count: 1},
                        {name: "+1::skin-tone-3", count: 2},
                        {name: "+1::skin-tone-4", count: 2},

                        // no (4 total)
                        {name: "-1::skin-tone-1", count: 3},
                        {name: "thumbsdown", count: 1},

                        // stop (3 votes - only has one recognized reaction)
                        {name: "stop", count: 3}];

      // when we run parseVotes
      var votes = parseVotes(reactions);

      // then votes are correct (all votes of a type aggregated regardless of skin color)
      return assertEqual(votes, {yes: 5, no: 4, stop: 3}, arguments.callee.name);
    },

    function GivenReactions1Yes0No0Stop2OtherReaction_WhenParseVotes_ThenVotesAreCorrect() {
      // given reactions of 1 yes, 0 no, 0 stop, 2 other reaction
      var reactions = [{name: "+1", count: 1}, {name: "other reaction", count: 2}];

      // when we run parseVotes
      var votes = parseVotes(reactions);

      // then votes are correct (1 yes, 0 no, 0 stop, other reactions ignored)
      return assertEqual(votes, {yes: 1, no: 0, stop: 0}, arguments.callee.name);
    },

    function GivenNoProposals_WhenGetResultsToPost_ThenNoResults() {
      // given there are no proposals
      var messages = [];
      
      // when we check status
      var resultsToPost = getResultsToPost(messages, new Date());

      // then we get no results
      return assertEqual(resultsToPost, [], arguments.callee.name);
    },

    function GivenOneProposal_AndItHasFutureDueDate_WhenGetResultsToPost_ThenDontPostAnything() {
      // given there is one proposal
      var messages = [{text: "Some text and then *Comment period closes:* Mon, Jun 25, 2018, 9:00 PM Pacific Time and then more text"}]
      
      // and its due date is in the future relative to reference date
      var referenceDate = new Date("Mon, Jun 25, 2018, 8:59 PM");
      
      // when we check status
      var resultsToPost = getResultsToPost(messages, referenceDate);
      
      // then we post no comment about results
      return assertEqual(resultsToPost, [], arguments.callee.name);
    },

    function GivenOneProposal_AndItHasPastDueDate_AndNoResultsPostedYet_WhenGetResultsToPost_ThenPostOneResult() {
      // given there is one proposal
      // and no results are posted for it yet
      var messages = [{ts: 123, replies: [{user: "someone other than the proposal bot", ts: 234}], text: "Some text and then *Comment period closes:* Mon, Jun 25, 2018, 9:00 PM Pacific Time and then more text"}]
      
      // and its due date is in the past relative to reference date
      var referenceDate = new Date("Mon, Jun 25, 2018, 9:01 PM");
      
      // when we check status
      var resultsToPost = getResultsToPost(messages, referenceDate);
      
      // then we post a comment about results (it has no reactions so it failed)
      return assertEqual(resultsToPost, [{thread_ts: 123, votes: {yes: 0, no: 0, stop: 0}, results: "fail", sentence: "The proposal failed."}], arguments.callee.name);
    },

    function GivenOneProposal_AndItHasPastDueDate_AndResultsAlreadyPosted_WhenGetResultsToPost_ThenDontPostAnything() {
      // given there is one proposal
      // and results are already posted for it
      var messages = [{ts: 123, replies: [{user: "B00", ts: 234}], text: "Some text and then *Comment period closes:* Mon, Jun 25, 2018, 9:00 PM Pacific Time and then more text"}]
      
      // and its due date is in the past relative to reference date
      var referenceDate = new Date("Mon, Jun 25, 2018, 9:01 PM");
      
      // when we check status
      var resultsToPost = getResultsToPost(messages, referenceDate);
      
      // then we post no comment about results (since they're already posted)
      return assertEqual(resultsToPost, [], arguments.callee.name);
    },
    
    function GivenTwoProposals_AndBothArePastDueDate_AndNeitherHasResultsYet_WhenGetResultsToPost_ThenPostBothResults() {
      // given there are two proposals
      // and neither has results yet
      var messages = [{ts: 123, reactions: [{name: "+1", count: 2}], replies: [{user: "not proposal bot", ts: 234}], text: "Some text and then *Comment period closes:* Mon, Jun 25, 2018, 9:00 PM Pacific Time and then more text"},
                      {ts: 124,  reactions: [{name: "+1", count: 3}], text: "Some text and then *Comment period closes:* Mon, Jun 25, 2018, 9:00 PM Pacific Time and then more text"}
                     ]
      
      // and both have due dates in the past relative to reference date
      var referenceDate = new Date("Mon, Jun 25, 2019, 12:00 AM");
      
      // when we check status
      var resultsToPost = getResultsToPost(messages, referenceDate);
      
      // then we post both results (they both are approved in this case)
      return assertEqual(resultsToPost, [{thread_ts: 123, votes: {yes: 2, no: 0, stop: 0}, results: "approve", sentence: "Approved!"},
                                         {thread_ts: 124, votes: {yes: 3, no: 0, stop: 0}, results: "approve", sentence: "Approved!"}], arguments.callee.name);
    },
    
    function GivenTwoProposals_AndBothArePastDueDate_AndOneDoesntHaveResultsYet_WhenGetResultsToPost_ThenPostToThatOne() {
      // given there are two proposals
      // and one doesn't have results yet
      var messages = [{ts: 123, reactions: [{name: "+1", count: 2}], replies: [{user: "B00", ts: 234}], text: "Some text and then *Comment period closes:* Mon, Jun 25, 2018, 9:00 PM Pacific Time and then more text"},
                      {ts: 124,  reactions: [{name: "stop", count: 3}], text: "Some text and then *Comment period closes:* Mon, Jun 25, 2018, 9:00 PM Pacific Time and then more text"}
                     ]
      
      // and both have due dates in the past relative to reference date
      var referenceDate = new Date("Mon, Jun 25, 2019, 12:00 AM");
      
      // when we check status
      var resultsToPost = getResultsToPost(messages, referenceDate);
      
      // then we post that one (it's a stop in this case)
      return assertEqual(resultsToPost, [{thread_ts: 124, votes: {yes: 0, no: 0, stop: 3}, results: "stop", sentence: "The proposal has been stopped. We are confirming the objection is grounded in our official documents and if so, whether it can be resolved."}], arguments.callee.name);
    },

  ];

  return(testsArr);
}
