import { main } from '../scraper.js';

main({ forceUpdate: true }).catch(err => {
  console.error(err);
  process.exit(1);
});
