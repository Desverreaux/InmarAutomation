/////////////////////////////////////////////////////////////////////////////////////////////////////
// Data 
/////////////////////////////////////////////////////////////////////////////////////////////////////

const pageContext = {
  pageType: undefined,
  data: undefined,
  tableElement: undefined
}

function initPageContext() {
  pageContext.pageType = getPageType();
  if (pageContext.pageType === 'detailed') {
    pageContext.data = getContainerTables();
  }
  else if (pageContext.pageType === 'quarantined') {
    pageContext.data = getQuarantinedTables();
    pageContext.tableElement = pageContext.data[0].element.parentNode;
  }
  else {
    console.log("page type is not identified")
  }

  
}

class drugInstance {
 
  static isRow(cells) {
    // Table must have the 8 rows expected 
    if (cells.length < 8) return false;

    // Cell 0 must not span multiple columns
    if (cells[0].hasAttribute('colspan')) return false;

    // Cell 0: must contain a checkbox label + input
    if (!cells[0].querySelector('label.inm-checkbox input[type="checkbox"]')) return false;

    // Cell 1: must be digits only, 8–12 long (NDC pattern).
    // Real values on this page are 11 digits (e.g. 63323056497,
    // 55150036501) but giving a bit of slack future-proofs this.
    const ndc = (cells[1].textContent || '').trim();
    if (!/^\d{8,12}$/.test(ndc)) return false;

    return true;
  }

  constructor(rowElementArray) {
    this.element = rowElementArray[0].parentNode;
    this.selector = rowElementArray[0].querySelector('label');
    this.ndc = rowElementArray[1].innerText.trim();
    this.product = rowElementArray[2].innerText.trim();
    this.expirationDate = rowElementArray[3].innerText.trim();
    this.lotNumber = rowElementArray[4].innerText.trim();
    this.serialNumber = rowElementArray[5].innerText.trim();
    this.manufactuerer = rowElementArray[6].innerText.trim();
    this.reconcile = rowElementArray[7].querySelector('input');
    this.void = rowElementArray[8].querySelector('label');
    this.exempt = rowElementArray[9].querySelector('label');
    this.tempbool = false;
  }

}

class quarantinedProduct {
  
   constructor(rowElementArray) {
    this.element = rowElementArray[0].parentNode;
    this.date = rowElementArray[0].innerText.trim();
    this.GLN = rowElementArray[1].innerText.trim();
    this.type = rowElementArray[2].innerText.trim();
    this.scan = rowElementArray[3].innerText.trim();
    this.ndc = rowElementArray[4].innerText.trim();
    this.productName = rowElementArray[5].innerText.trim();
    this.expirationDate = rowElementArray[6].innerText.trim();
    this.lotNumber = rowElementArray[7].innerText.trim();
    this.serialNumber = rowElementArray[8].innerText.trim();
    this.manufactuerer = rowElementArray[9].innerText.trim();
    this.status = rowElementArray[10].innerText.trim();
    this.reconcileDate = rowElementArray[11].innerText.trim();
    this.selector = rowElementArray[12].querySelector('input');

  }

}

class shipment {
  
  constructor(shipmentElement) {
    
    this.element = shipmentElement;

    const data = this.extractValues();

    this.date = data["Transaction Date"];
    this.transactionNumber = data["Buisness Transaction #"];
    this.seller = data["Sold from Owner"];
    this.companyShippedFrom = data["Shipped From"];
    this.addressShippedFrom = data["Shipped From Address"];
    this.companySoldTo = data["Sold to Owner"];
    this.companyShippedTo = data["Shipped To"];
    this.addressShippedTo = data["Shipped To Address"];
  }

  extractValues(){
    const headers = this.element.querySelectorAll('thead th');
    const values = this.element.querySelectorAll('tbody tr td');

    if( values.length !== headers.length) {
      console.warn("Table does not have a value for each header");
    }

    data = Array.from(headers).map((headerElement, index) => {
      
      var key = headerElement.textContent.trim();
      var value = { 
        "value": values[index].textContent.trim(),
        "element": values[index]
      }            
    
      if (key == "Business Transaction #") {
        value = values[index].innerText.split("\n");
      }
      
      return { key, value }
    });
    return data;
  }


}

class transactions {

  //Since the transaction table can have its columns changed there needs to a check that each column is what its supposed to be 

  constructor(rowElementArray) {
    this.element = rowElementArray[0].parentNode;
    this.date = rowElementArray[0].innerText.trim();


    this.ndc = rowElementArray[1].innerText.trim();
    this.product = rowElementArray[2].innerText.trim();
    this.expirationDate = rowElementArray[3].innerText.trim();
    this.lotNumber = rowElementArray[4].innerText.trim();
    this.serialNumber = rowElementArray[5].innerText.trim();
    this.manufactuerer = rowElementArray[6].innerText.trim();
    this.reconcile = rowElementArray[7].querySelector('label');
    this.void = rowElementArray[8].querySelector('label');
    this.exempt = rowElementArray[9].querySelector('label');
  }

}

//These classes are used instead of the actuall css classes because of how the inmar site is set up 
//setting the properties correctly using css classes ends with them being overwritten so we are having
//to use js objects that have each property that needs to be manually changed
class cssClass {
  static greenOverlay = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '98%',
    backgroundColor: 'green',
    opacity: '0.1',
    pointerEvents: 'none',
    zIndex: 9999,
  }

  static redOverlay = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'red',
    opacity: '0.5',
    pointerEvents: 'none',
    zIndex: 9999,
  }


}