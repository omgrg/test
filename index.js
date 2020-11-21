const fs = require ( 'fs' );
const EdgarSearchService = require ( './vacuum/edgar-search' );

let cmdArgs = [ '2020-11-17', '2020-11-17'];

const urlDates = EdgarSearchService.getIterations ( cmdArgs[ 0 ], cmdArgs[ 1 ] );

EdgarSearchService
    .startWebCrawler ( urlDates )
    .then ( ( trades ) => {

        fs.writeFileSync( './trades.json', JSON.stringify ( trades, null,2 ) );
        console.log( 'Finished Running Script' );

    } )
    .catch ( error => console.log (   error  ) );
