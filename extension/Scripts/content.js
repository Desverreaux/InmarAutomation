//////////////////////////////////////////////////////////////////////////////////////////////////////
//TESTING
//////////////////////////////////////////////////////////////////////////////////////////////////////

function debug() {
  return;
  //debugger;
}

//////////////////////////////////////////////////////////////////////////////////////////////////////
//FUNCTIONS
//////////////////////////////////////////////////////////////////////////////////////////////////////

function getPageType() {
  const url = window.location.href;
  if (url.includes('/scannedItemsNotReconciled')) return 'quarantined';
  else if (url.includes('/details')) return 'detailed';
  else if (url.includes('/reconcile')) return 'transactions';
  return 'unknown';
}

//highLightRows takes in a array of dom objects and creates overlay element for each
function highLightRows(drugs) {
  // console.log(drugs);
  for( drug of drugs) {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, cssClass.greenOverlay); 
    drug.element.style.position = 'relative';
    drug.element.appendChild(overlay);
  }
}

function clickBackButton() {
  //document selector made by chrome dev tools
  document.querySelector('#inm-skip-to-main > section > div:nth-child(9) > header > div.inm-headline__actions.no-print > button').click();
}

function toggleReconcileBoxs() {
  if (pageContext.data && pageContext.data.length > 0) {
    pageContext.data.forEach(drug => {
        drug.reconcile.checked = !drug.reconcile.checked;

        // Trigger change event in case framework needs it
        drug.reconcile.dispatchEvent(new Event("change", { bubbles: true }));    });
  }
}

function toggleEmptyQuarantinedEntries() {
  if (pageContext.data && pageContext.data.length > 0) {
    console.log(pageContext.data)
    pageContext.data.forEach(drug => {
      if(drug.selector.checked === false && drug.ndc === "") {
        drug.selector.checked = true;

        // Trigger change event in case framework needs it
        drug.selector.dispatchEvent(new Event("change", { bubbles: true }));   
      }
    });
  }
}


function testFlash(duration = 200) {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, cssClass.redOverlay);

    document.body.appendChild(overlay);

    setTimeout(() => {
        overlay.remove();
    }, duration);
}

function getShipmentTable() {
    return new shipment(document.querySelector('table:first-of-type'))
}

function getContainerTables() {

  const rows = document.querySelectorAll('table.inm-table tbody tr');
  const entries = []

  for (let row of rows) {
      const cells = row.children;
      if(drugInstance.isRow(cells)) {
        let validEntry = new drugInstance(cells)
        entries.push(validEntry);
      }
  }
  return entries;

}

function getQuarantinedTables() {

  const rows = document.querySelectorAll('tbody tr[role="row"]');
  const entries = []

  for (let row of rows) {
      const cells = row.children;
        let entry = new quarantinedProduct(cells)
        entries.push(entry);
  }

  return entries;

}


function runManualFunction() {
  testFlash();

  // Example: log the page title
  console.log('Page title:', document.title);
}

//////////////////////////////////////////////////////////////////////////////////////////////////////
//EXECUTION
//////////////////////////////////////////////////////////////////////////////////////////////////////

function main() {
  initPageContext();
  highLightRows(pageContext.data);
  console.log(pageContext.tableElement);
}

initEvents();

