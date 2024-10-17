const stripe = require('stripe')(process.env.STRIPE_SECRET);
const { premiumPlan } = require('../modules/products');
const axios = require('axios');
const cheerio = require('cheerio');
const imageSize = require('image-size');

/**
 * Add a user to the freePlan on Stripe.
**/
async function addUsertoFreePlan(userEmail) {
  console.log(`Adding user with Email: ${userEmail} to Stripe freePlan...`);

  // Create a new customer in Stripe
  const customer = await stripe.customers.create({
    email: userEmail,
    description: `${userEmail}`
  });

  console.log(`User with Email: ${userEmail} successfully created in Stripe as customer ID: ${customer.id}.`);

  // Since we're not creating a PaymentIntent, just return the Stripe customer ID
  return {
    stripeCustomerId: customer.id
  };
}

function formatDateToDDMMYYHHMMSS() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear()).substr(-2);
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ddmmyyhhmmss = `${day}${month}${year}${hours}${minutes}${seconds}`;
  return ddmmyyhhmmss;
}

async function getSearchResult(query) {
  const google = {
      api_id: process.env.GOOGLE_RAKUBUN_API,
      engine_id: process.env.GOOGLE_SEARCH_ENGINE_ID
  };

  const url = new URL(`https://www.googleapis.com/customsearch/v1?key=${google.api_id}&cx=${google.engine_id}&q=${query}&num=5&dateRestrict=m1`).href;

  try {
      const response = await axios.get(url);
      return processSearchResults(response.data); // Contains the search results
  } catch (error) {
      console.error('Error fetching search results:', error);
      return null; // Or handle the error as needed
  }
}
function processSearchResults(data) {
  if (!data || !data.items) {
      console.error('Invalid or empty search data');
      return [];
  }
  return data.items.map(item => {
    return {title:item.title,link:item.link};
  });
}
async function getImageDimensions(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const dimensions = imageSize(response.data);
    return dimensions;
  } catch (error) {
    console.error('Error fetching image dimensions:', error);
    return null;
  }
}

async function getImageSearchResult(url) {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const images = [];

    $('img').each((i, element) => {
      const imgSrc = $(element).attr('src') || $(element).attr('data-src');
      if (imgSrc) {
        const fullImgSrc = imgSrc.startsWith('http') ? imgSrc : new URL(imgSrc, url).href; // Handle relative URLs
        images.push(fullImgSrc);
      }
    });

    // Filter large images
    const largeImages = [];
    for (let imgSrc of images) {
      const dimensions = await getImageDimensions(imgSrc);
      if (dimensions && dimensions.height > 400) { // Example size criteria
        largeImages.push({
          title: $(`img[src='${imgSrc}']`).attr('alt') || '', // Use alt attribute as title, fallback to 'Large Image'
          link: imgSrc,
          thumbnail: imgSrc, // Assuming the original image serves as a thumbnail; adjust as needed
        });
      }
    }

    return largeImages;
  } catch (error) {
    console.error('Error fetching the page or images:', error);
    return [];
  }
}
/**
 * Fetches the favicon using the favicone.com API.
 * 
 * @param {string} domain The domain to fetch the favicon for.
 * @returns {Promise<object>} A promise that resolves to the favicon information or null if failed.
 */
async function fetchFavicon(domain) {
  try {
      const encodedDomain = encodeURIComponent(domain);
      const apiUrl = `https://favicone.com/${encodedDomain}?json`;
      const response = await axios.get(apiUrl);
      return response.data;
  } catch (error) {
      console.error('Failed to fetch favicon for domain:', domain, error.message);
      return null;
  }
}

/**
* Updates the favicons for all affiliates in the database if not already updated.
*/
async function updateFavicon() {
  try {
      const affiliates = await global.db.collection('affiliate').find({}).toArray();

      for (const affiliate of affiliates) {
          if (!affiliate.hasIcon) {  // Check if favicon is already updated
              const faviconData = await fetchFavicon(affiliate.domain);
              if (faviconData && faviconData.hasIcon) {
                  await global.db.collection('affiliate').updateOne(
                      { _id: affiliate._id },
                      { $set: { favicon: faviconData.icon, hasIcon: true } }
                  );
                  console.log(`Updated favicon for ${affiliate.domain}`);
              } else {
                  console.log(`No favicon found or failed to fetch for ${affiliate.domain}`);
              }
          } else {
              console.log(`Favicon already updated for ${affiliate.domain}`);
          }
      }
  } catch (error) {
      console.error('Error updating favicons:', error);
  }
}
async function checkIfAdmin(user){
  return ['japanclassicstore@gmail.com'].includes(user.email)
}

module.exports = {
  addUsertoFreePlan,
  formatDateToDDMMYYHHMMSS,
  getSearchResult,
  getImageSearchResult,
  updateFavicon,
  fetchFavicon,
  checkIfAdmin
};
