function setup() {
  var config = getConfig();
  var formId = config["form_id"];
  var form = FormApp.openById(formId);
  
  clearTriggers();
  ScriptApp.newTrigger("processProposalResults").timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger("onSubmit").forForm(form).onFormSubmit().create();
}

function clearTriggers() {
    var allTriggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < allTriggers.length; i++)
        ScriptApp.deleteTrigger(allTriggers[i]);
}
