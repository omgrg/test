const request = require ( 'request-promise' );
const moment = require ( 'moment' );
const cheerio = require ( 'cheerio' );
const striptags = require ( 'striptags' );
const puppeteer = require ( 'puppeteer' );

const secLinks = require ( './static-data/sec-link.json' );

function timeout ( ms ) {
    return new Promise ( resolve => setTimeout ( resolve, ms ) );
}

const EdgarSearchService = {

    getIterations: ( startDate, endDate ) => {

        if ( moment ( startDate ) > moment ( endDate ) ) {
            throw new Error ( 'Start date bigger than end date' );
        }

        const iterations = [];
        const currentDate = moment ( startDate );
        const toDate = moment ( startDate );

        let endNotReached = true;

        while ( endNotReached ) {

            toDate.add ( 1, 'month' );

            if ( toDate >= moment ( endDate ) ) {

                // If we reach the last iteration, we just get the leftover days until the end date
                iterations.push ( `&dateRange=custom&startdt=${ currentDate.format ( 'YYYY-MM-DD' ) }&enddt=${ moment ( endDate ).format ( 'YYYY-MM-DD' ) }` );

                // And stop looping
                endNotReached = false;

            } else {
                iterations.push ( `&dateRange=custom&startdt=${ currentDate.format ( 'YYYY-MM-DD' ) }&enddt=${ toDate.format ( 'YYYY-MM-DD' ) }` );
            }

            //go to the next interval, starting with the last date of the previous interval
            currentDate.add ( 1, 'month' );
        }

        return iterations;
    },

    paginate: async ( pageNumber, secLink, date ) => {

        const data = {
            dates: [],
            trades: [],
            issuers: []
        };

        const browser = await puppeteer.launch ();
        const page = await browser.newPage ();
        await page.goto ( secLink + date + '&page=' + ( pageNumber + 1 ) );

        console.log ( `Got: ${ secLink + date + '&page=' + ( pageNumber + 1 ) }` );

        // The SEC Site is hella slow fam
        await timeout ( 2000 );

        const bodyHandle = await page.$ ( 'body' );
        const html = await page.evaluate ( body => body.innerHTML, bodyHandle );

        let $ = cheerio.load ( html ); // gets the html for the search page

        // Get issuer names
        let companies = $ ( '.entity-name' );

        for ( let i = 0; i < ( Object.entries ( companies ) ).length; i++ ) {

            let company = companies.eq ( i ).text ().split ( '(' )[ 0 ];

            // Remove CIK from end
            if ( company !== 'Filing entity/person' && company !== '' ) {

                //totalIssuers.push ( company );
                data.issuers.push ( company );
            }
        }

        // Dates
        let individualDates = $ ( '.filed' );

        for ( let i = 0; i < (Object.entries ( individualDates )).length; i++ ) {

            let date = individualDates.eq ( i ).text ();

            // Check if we get MM/DD/YY
            if ( date.match ( /^\d{4}-\d{2}-\d{2}$/gm ) ) {

                date = date.trim ();

                // totalDates.push ( date );
                data.dates.push ( date );
            }
        }

        let links = await page.$$ ( 'a.preview-file' );

        for ( const link of links ) {

            await link.click ();
            await timeout ( 30 );
            //await page.screenshot ( { path: 'achromatopsia.png' } );

            let bodyHandle = await page.$ ( 'body' );
            let html = await page.evaluate ( body => body.innerHTML, bodyHandle );
            let smol = cheerio.load ( html );

            data.trades.push ( smol ( 'a#open-file' ).attr ( 'href' ) );

            page.click ( 'button[class="btn btn-light btn-outline-dark"]' );

            await timeout ( 30 );
            await page.screenshot ( { path: 'achromatopsia.png' } );

            console.log ( smol ( 'a#open-file' ).attr ( 'href' ) );

        }

        await page.evaluate ( () => window.stop () );

        console.log ( `Processed ${ pageNumber }, got ${ data.trades.length }, ${ data.issuers.length } issuers and ${ data.dates.length }` );

        // Two checks for end of file:
        await browser.close ();

        return data;

    },

    crawlSearchPage:  async ( secLink, date ) => {

        const totalIssuers = [];
        const totalDates = [];
        const totalTrades = [];
        const report = { };

        for ( let i = 0; i < 200; i++ ) {

            try {
                const paginateResult = await EdgarSearchService.paginate( i, secLink, date );

                if ( paginateResult.trades.length === 0 ) {
                    break;
                }

                totalDates.push ( paginateResult.dates );
                totalIssuers.push ( paginateResult.issuers );
                totalTrades.push ( paginateResult.trades );

                report[ `page${ i+1 }` ] = {
                    link :  paginateResult.trades
                };

            } catch ( error ) {

                console.log ( error );

                report[ `page${ i+1 }` ] = {
                    error :  error.message || error.toString()
                };
            }

        }

        return {
            totalTrades: totalTrades.flat(),
            totalIssuers: totalIssuers.flat(),
            report: report
        };

    },

    startWebCrawler: async ( urlDates ) => {

        const reports = {};
        let searchPageResult;

        for ( const [ form, secLink ] of Object.entries ( secLinks ) ) {

            for ( const urlDate of urlDates ) {

                try {

                    searchPageResult = await EdgarSearchService.crawlSearchPage ( secLink, urlDate );

                    reports[ form ] = reports[ form ] || {};
                    reports[ form ].searchPage = searchPageResult.report;

                } catch ( error ) {
                    console.log (  error );
                }

            }

        }

        return {
            totalTrades : searchPageResult.totalTrades,
            totalIssuers: searchPageResult.totalIssuers,
            report: searchPageResult.report
        };

    }

};

module.exports = EdgarSearchService;