const ngrok = require('@ngrok/ngrok');

async function startNgrok(port) {
  try {
    
    // Set NGROK auth token if required
    if (process.env.NGROK_AUTH_TOKEN) {
      await ngrok.authtoken(process.env.NGROK_AUTH_TOKEN);
    }

    // Start a new NGROK tunnel to the specified port
    const url = (await ngrok.connect({
      addr: port,      // Port or address to tunnel to
      region: 'jp'     // Optionally set the region
    })).url();

    console.log(`NGROK is publicly exposing your localhost at port ${port} on: ${url}`);

    return url; // Return the NGROK URL for use in other parts of your application
  } catch (error) {
    console.error('Failed to start NGROK:', error);
    return null; // Return null or handle the error as appropriate
  }
}

async function stopNgrok(port) {
  try {
    // Disconnect any existing tunnels if ngrok is already running
    await ngrok.disconnect();  // This will only disconnect tunnels without killing the ngrok process
    await ngrok.kill();        // This ensures that all ngrok processes are terminated


    console.log(`Disconnect any existing tunnels if ngrok is already running`);

  } catch (error) {
    console.error('Failed to stop NGROK:', error);
    return null; // Return null or handle the error as appropriate
  }
}
module.exports = {startNgrok,stopNgrok};
