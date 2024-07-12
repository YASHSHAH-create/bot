require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');
const bodyParser = require('body-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cors = require('cors');
puppeteer.use(StealthPlugin());

const app = express();
const port = 3000;

const server = http.createServer(app);
const io = socketIo(server);

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

app.use(bodyParser.json());
app.use(express.static('public'));

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

function sendEvent(socket, message) {
  if (socket && typeof socket.emit === 'function') {
    socket.emit('consoleMessage', message);
  } else {
    console.error('Socket is not properly initialized or does not have emit method.');
  }
}
app.use(cors());
app.post('/api/generate', async (req, res) => {
  const userInput = req.body.input;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(userInput);
    const response = await result.response;
    const text = await response.text();
    sendEvent(req.app.get('socket'), 'Generated response successfully.');
    res.json({ answer: text });
  } catch (error) {
    sendEvent(req.app.get('socket'), 'Error fetching data from Gemini API: ' + error.message);
    res.status(500).json({ error: 'Error fetching data from Gemini API' });
  }
});

app.post('/api/postTweet', async (req, res) => {
  const tweetText = req.body.tweet;
  const socket = req.app.get('socket');

  try {
    const browser = await puppeteer.launch({
      headless: "new",
      executablePath: '/usr/bin/google-chrome',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--window-size=1920x1080',
        '--dns-prefetch-disable',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
      userDataDir: './temp'
    });

    const page = await browser.newPage();

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    sendEvent(socket, 'Waiting for username input...');
    await page.goto('https://twitter.com/login', { waitUntil: 'networkidle2' });

    async function lognin(params) {

      try {
        await page.waitForSelector('input[name="text"]', { visible: true, timeout: 60000 });
        await page.type('input[name="text"]', 'kashyapakashh');
        await page.keyboard.press('Enter');
        

        sendEvent(socket, 'Waiting for password input...');
        await page.waitForSelector('input[name="password"]', { visible: true, timeout: 60000 });
        await page.type('input[name="password"]', 'Yash@12345');
        await page.keyboard.press('Enter');

        sendEvent(socket, 'Taking screenshot...');

        setTimeout(async () => {
          const screenshotPath = path.join(__dirname, 'public', 'screenshot.png');
          await page.screenshot({ path: screenshotPath, fullPage: true });
        }, 3000); // 3000 milliseconds = 3 seconds

        sendEvent(socket, 'Screenshot taken and saved successfully!');
        sendEvent(socket, 'Waiting for navigation after login...');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
      } catch (error) {
        console.log('login error');
      }

      sendEvent(socket, 'Login successful!');
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log(page.url())
    if (page.url().includes('/home')) {
      sendEvent(socket, 'Login skipped');
    }

    lognin();

    await page.waitForSelector('div[data-testid="tweetTextarea_0"]', { visible: true, timeout: 0 });
    await page.type('div[data-testid="tweetTextarea_0"]', tweetText);
    await page.waitForSelector('button[data-testid="tweetButtonInline"]', { visible: true, timeout: 60000 });
    await page.click('button[data-testid="tweetButtonInline"]');

    sendEvent(socket, 'Tweet posted successfully!');
    await browser.close();

    res.json({ status: 'Tweet posted successfully!' });
  } catch (error) {
    sendEvent(socket, 'Error posting tweet: ' + error.message);
    res.status(500).json({ error: 'Error posting tweet' });
  }
});


app.post('/api/postTweetWithImage', upload.single('image'), async (req, res) => {
  const description = req.body.description;
  const image = req.file;
  const imageUrl = req.body.imageUrl;
  const socket = req.app.get('socket');

  let downloadedImagePath = null;

  try {
    if (imageUrl) {
      console.log('Downloading image from URL...');
      const response = await axios({
        url: imageUrl,
        responseType: 'stream',
      });
      const imagePath = path.join(__dirname, 'uploads', 'downloaded_image.jpg');
      downloadedImagePath = imagePath;
      const writer = fs.createWriteStream(imagePath);
      response.data.pipe(writer);
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
      console.log('Image downloaded successfully!');
    }

    const browser = await puppeteer.launch({
      headless: "new", // Set to true for production
     
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--window-size=1920x1080',
        '--dns-prefetch-disable',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
      userDataDir: './temp'
    });
    const page = await browser.newPage();

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    console.log('Waiting for username input...');
    await page.goto('https://twitter.com/login', { waitUntil: 'networkidle2' });

    async function login() {
      try {
        await page.waitForSelector('input[name="session[username_or_email]"]', { visible: true, timeout: 60000 });
        await page.type('input[name="session[username_or_email]"]', 'kashyapakashh');
        await page.keyboard.press('Enter');

        console.log('Waiting for password input...');
        await page.waitForSelector('input[name="session[password]"]', { visible: true, timeout: 60000 });
        await page.type('input[name="session[password]"]', 'Yash@12345');
        await page.keyboard.press('Enter');

        console.log('Taking screenshot...');
        setTimeout(async () => {
          const screenshotPath = path.join(__dirname, 'public', 'screenshot.png');
          await page.screenshot({ path: screenshotPath, fullPage: true });
        }, 3000); // 3000 milliseconds = 3 seconds

        console.log('Screenshot taken and saved successfully!');
        console.log('Waiting for navigation after login...');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
      } catch (error) {
        console.log('login error', error);
      }

      console.log('Login successful!');
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log(page.url());
    if (page.url().includes('/home')) {
      console.log('Login skipped');
    } else {
      await login();
    }

    await page.waitForSelector('div[data-testid="tweetTextarea_0"]', { visible: true, timeout: 0 });
    await page.type('div[data-testid="tweetTextarea_0"]', description);

    if (image || downloadedImagePath) {
      const imagePath = image ? path.join(__dirname, image.path) : downloadedImagePath;
      console.log(`Image path: ${imagePath}`);

      await page.waitForSelector('input[data-testid="fileInput"]', { visible: true });
      const fileInput = await page.$('input[data-testid="fileInput"]');
      await fileInput.uploadFile(imagePath);

      console.log('Image uploaded successfully!');
      await new Promise(resolve => setTimeout(resolve, 6000));

      // Wait for the tweet button to be visible and clickable
      await page.waitForSelector('button[data-testid="tweetButtonInline"]', { visible: true, timeout: 60000 });
      await page.click('button[data-testid="tweetButtonInline"]');
      await new Promise(resolve => setTimeout(resolve, 6000));
      console.log('Tweet posted successfully!');
    }

    await browser.close();

    res.json({ status: 'Tweet posted successfully!' });
  } catch (error) {
    console.error('Error posting tweet:', error.message);
    res.status(500).json({ error: 'Error posting tweet' });
  } finally {
    if (image) {
      fs.unlink(image.path, (err) => {
        if (err) console.error('Failed to delete image file:', err);
      });
    }
    if (downloadedImagePath) {
      fs.unlink(downloadedImagePath, (err) => {
        if (err) console.error('Failed to delete downloaded image file:', err);
      });
    }
  }
});
app.use(cors());

const url = 'https://www.coindesk.com/livewire/';

async function scrapeCryptoNews() {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const articles = [];

    $('.side-cover-cardstyles__SideCoverCardWrapper-sc-1nd3s5z-0').each((index, element) => {
      const title = $(element).find('.card-title h4').text().trim();
      const link = $(element).find('.card-title-link').attr('href');
      const description = $(element).find('.card-descriptionstyles__CardDescriptionWrapper-sc-463n0d-0 p').text().trim();
      const imageUrl = $(element).find('picture img').attr('src');
      const date = $(element).find('.card-datestyles__CardDateWrapper-sc-y5z1ee-0 span').text().trim();

      if (title && link && description && imageUrl && date) {
        articles.push({
          title,
          link: `https://www.coindesk.com${link}`,
          description,
          imageUrl,
          date
        });
      }
    });

    return articles;
  } catch (error) {
    console.error('Error scraping the website:', error);
    return [];
  }
}

app.get('/api/news', async (req, res) => {
  const news = await scrapeCryptoNews();
  res.json(news);
});


app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
  console.log('a user connected');
  app.set('socket', socket);

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});








const TelegramBot = require('node-telegram-bot-api');
const botToken = '7362200370:AAGCvGF0FyHpCf3eldXsZD7n23SjBnYXgFM'; // Replace with your Telegram bot token
const apiEndpoint = 'http://13.202.144.95:3000'; // Replace with your server endpoint

const bot = new TelegramBot(botToken, { polling: true });

// Command handler for /start or /news
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const commandsList = `
  Welcome! Here are the available commands:
  /news - Fetch today's crypto news
  /generate <text> - Generate a response based on input text
  /data - Fetch cryptocurrency data
  /help or /commands - Show this help message
  `;
  bot.sendMessage(chatId, commandsList);
});

// /news command
bot.onText(/\/news/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Fetching today\'s crypto news...');
  sendTodayCryptoNews(chatId);
});

//generate button
bot.onText(/\/generate (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userInput = match[1]; // Extract the user input from the message

  // Show "Generating..." message
  bot.sendMessage(chatId, 'Generating...');

  try {
    const apiResponse = await generateResponse(userInput);
    const shortAnswer = apiResponse.answer.slice(0, 50); // Limit answer to first 50 characters
    bot.sendMessage(chatId, apiResponse.answer, {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Post Tweet', callback_data: `post_teet_${shortAnswer}` }]
        ]
      }
    });
  } catch (error) {
    console.error('Error generating response:', error);
    bot.sendMessage(chatId, 'Failed to generate response.');
  }
});

bot.onText(/\/data/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Fetching cryptocurrency data...');

  try {
    const response = await axios.get(`${apiEndpoint}/api/crypto-data`);
    const data = response.data;

    // Format and send the data
    const message = `
      *Market Summary:*
      ${data.marketSummary.text}
      
      *Trending Cryptos:*
      ${formatCryptoList(data.trendingCryptos)}
      
      *New Cryptos:*
      ${formatCryptoList(data.newCryptos)}
      
      *Most Viewed Cryptos:*
      ${formatCryptoList(data.mostViewedCryptos)}
      
      *Exchanges:*
      ${formatExchangeList(data.exchanges)}
    `;

    // Send formatted data with "Post Tweet" buttons
    const keyboard = {
      inline_keyboard: [
        [{ text: 'Post Tweet', callback_data: 'post_tweet_all' }]
      ]
    };

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown', reply_markup: JSON.stringify(keyboard) });
  } catch (error) {
    console.error('Error fetching crypto data:', error);
    bot.sendMessage(chatId, 'Failed to fetch cryptocurrency data.');
  }
});

function formatCryptoList(cryptos) {
  return cryptos.map((crypto) => {
    return `
      Rank: ${crypto.rank}
      Name: ${crypto.name}
      Symbol: ${crypto.symbol}
      Price: ${crypto.price}
      Market Cap: ${crypto.marketCap}
      Volume: ${crypto.volume}
    `;
  }).join('\n');
}

function formatExchangeList(exchanges) {
  return exchanges.map((exchange) => {
    return `
      Name: ${exchange.name}
      Score: ${exchange.score}
      24h Volume: ${exchange.volume24h}
      Markets: ${exchange.markets}
      Visits: ${exchange.visits}
      Coins: ${exchange.coins}
      Pairs: ${exchange.pairs}
    `;
  }).join('\n');
}

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id; // Get the message ID for editing
    const data = callbackQuery.data;
  
    if (data.startsWith('post_teet_')) {
      const tweetText = data.split('_').slice(2).join('_');
  
      try {
        // Show "Posting..." message
        await bot.editMessageText('Posting...', {
          chat_id: chatId,
          message_id: messageId,
        });
  
        // Send the tweet to the API
        const apiResponse = await axios.post(`${apiEndpoint}/api/postTweet`, { tweet: tweetText });
  
        if (apiResponse.data.success) {
          await bot.editMessageText('Tweet posted successfully.', {
            chat_id: chatId,
            message_id: messageId,
          });
        } else {
          await bot.editMessageText(`Tweet posted successfully.`, {
            chat_id: chatId,
            message_id: messageId,
          });
        }
      } catch (error) {
        console.error('Error posting tweet:', error);
        await bot.editMessageText('Failed to post tweet.', {
          chat_id: chatId,
          message_id: messageId,
        });
      }
    }
  });
  

//callback end 





bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id; // Get the message ID for editing
  const data = callbackQuery.data;

  if (data.startsWith('post_tweet_')) {
    try {
      if (data === 'post_tweet_all') {
        // Show "Posting..." message
        await bot.editMessageText('Posting...', {
          chat_id: chatId,
          message_id: messageId,
        });

        // Fetch cryptocurrency data
        const response = await axios.get(`${apiEndpoint}/api/crypto-data`);
        const cryptoData = response.data;

        // Format the tweet text
        const tweetText = `
Market Summary: ${cryptoData.marketSummary.text}

Trending Cryptos:
${cryptoData.trendingCryptos.map(c => `
  Rank: ${c.rank}
  Name: ${c.name}
  Symbol: ${c.symbol}
  Price: ${c.price}
  Market Cap: ${c.marketCap}
  Volume: ${c.volume}
`).join('\n')}

New Cryptos:
${cryptoData.newCryptos.map(c => `
  Rank: ${c.rank}
  Name: ${c.name}
  Symbol: ${c.symbol}
  Price: ${c.price}
  Market Cap: ${c.marketCap}
  Volume: ${c.volume}
`).join('\n')}

Most Viewed Cryptos:
${cryptoData.mostViewedCryptos.map(c => `
  Rank: ${c.rank}
  Name: ${c.name}
  Symbol: ${c.symbol}
  Price: ${c.price}
  Market Cap: ${c.marketCap}
  Volume: ${c.volume}
`).join('\n')}

Exchanges:
${cryptoData.exchanges.map(e => `
  Name: ${e.name}
  Score: ${e.score}
  24h Volume: ${e.volume24h}
  Markets: ${e.markets}
  Visits: ${e.visits}
  Coins: ${e.coins}
  Pairs: ${e.pairs}
`).join('\n')}
`;


        // Send tweet text to the API
        const apiResponse = await axios.post(`${apiEndpoint}/api/postTweet`, {
          tweet: tweetText
        });

        // Check if API response contains a message
        if (apiResponse.data && apiResponse.data.status === 'Tweet posted successfully!') {
          // Display API response in Telegram
          await bot.editMessageText(apiResponse.data.status, {
            chat_id: chatId,
            message_id: messageId,
          });
        } else {
          // Handle case where API response message is empty or not successful
          await bot.editMessageText('Failed to post tweet.', {
            chat_id: chatId,
            message_id: messageId,
          });
        }
      } else {
        // Show "Posting..." message
        await bot.editMessageText('Posting...', {
          chat_id: chatId,
          message_id: messageId,
        });

        // Extract the index of the article from the callback data
        const articleIndex = parseInt(data.split('_')[2], 10);

        // Fetch today's news
        const news = await fetchTodayCryptoNews();

        // Check if the article index is valid
        if (news && news.length > articleIndex) {
          const article = news[articleIndex];

          // Send description and image URL to API
          const { description, imageUrl } = article;
          const apiResponse = await sendDescriptionAndImageToAPI(description, imageUrl);

          // Check if API response contains a message
          if (apiResponse && apiResponse.status === 'Tweet posted successfully!') {
            // Display API response in Telegram
            await bot.editMessageText(apiResponse.status, {
              chat_id: chatId,
              message_id: messageId,
            });
          } else {
            // Handle case where API response message is empty or not successful
            await bot.editMessageText('Failed to post tweet.', {
              chat_id: chatId,
              message_id: messageId,
            });
          }

        } else {
          await bot.editMessageText('Invalid article selection.', {
            chat_id: chatId,
            message_id: messageId,
          });
        }
      }
    } catch (error) {
      console.error('Error sending data to API or displaying response:', error);
      await bot.editMessageText('Failed to send data to API or display response.', {
        chat_id: chatId,
        message_id: messageId,
      });
    }
  }
});

async function sendTodayCryptoNews(chatId) {
  try {
    const today = new Date().toISOString().slice(0, 10); // Get today's date in YYYY-MM-DD format
    const response = await axios.get(`${apiEndpoint}/api/news?date=${today}`);
    const news = response.data;

    if (news.length === 0) {
      bot.sendMessage(chatId, 'No news available for today.');
      return;
    }

    news.forEach((article, index) => {
      const message = `
        *${article.title}*
        ${article.description}
        Date: ${article.date}
        [Read more](${article.link})
      `;

      const keyboard = {
        inline_keyboard: [
          [{ text: 'Post Tweet', callback_data: `post_tweet_${index}` }]
        ]
      };

      bot.sendMessage(chatId, message, { parse_mode: 'Markdown', reply_markup: JSON.stringify(keyboard) });
    });

  } catch (error) {
    console.error('Error fetching news:', error);
    bot.sendMessage(chatId, 'Error fetching news.');
  }
}

async function sendTodayCryptoNewsInline(query) {
  try {
    const today = new Date().toISOString().slice(0, 10); // Get today's date in YYYY-MM-DD format
    const response = await axios.get(`${apiEndpoint}/api/news?date=${today}`);
    const news = response.data;

    const results = news.map((article, index) => ({
      type: 'article',
      id: index.toString(),
      title: article.title,
      description: article.description,
      input_message_content: {
        message_text: `
          *${article.title}*
          ${article.description}
          Date: ${article.date}
          [Read more](${article.link})
        `,
        parse_mode: 'Markdown',
      },
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Post Tweet', callback_data: `post_tweet_${index}` }]
        ]
      }
    }));

    bot.answerInlineQuery(query.id, results);

  } catch (error) {
    console.error('Error fetching news:', error);
    bot.answerInlineQuery(query.id, []);
  }
}

async function fetchTodayCryptoNews() {
  try {
    const today = new Date().toISOString().slice(0, 10); // Get today's date in YYYY-MM-DD format
    const response = await axios.get(`${apiEndpoint}/api/news?date=${today}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching today\'s news:', error);
    return [];
  }
}

async function sendDescriptionAndImageToAPI(description, imageUrl) {
  try {
    const response = await axios.post(`${apiEndpoint}/api/postTweetWithImage`, {
      description,
      imageUrl
    });

    return response.data; // Assuming API responds with text
  } catch (error) {
    console.error('Error sending data to API:', error);
    throw new Error('Failed to send data to API.');
  }
}



//scrape data from website api 

const urlMain = 'https://coinmarketcap.com/';
const urlTrending = 'https://coinmarketcap.com/trending-cryptocurrencies/';
const urlNew = 'https://coinmarketcap.com/new/';
const urlMostViewed = 'https://coinmarketcap.com/most-viewed-pages/';
const urlExchanges = 'https://coinmarketcap.com/rankings/exchanges/';

async function fetchData(url) {
    const result = await axios.get(url);
    return cheerio.load(result.data);
}

async function getMarketSummary() {
    const $ = await fetchData(urlMain);
    let marketSummary = {};

    const summarySelector = '.SummaryHeader_des-content__En7s_';
    const summaryText = $(summarySelector).text().trim();

    marketSummary.text = summaryText;

    return marketSummary;
}

async function getTrendingCryptos() {
    const $ = await fetchData(urlTrending);
    let trendingCryptos = [];

    $('tr').slice(1, 6).each((index, element) => {
        const rank = $(element).find('td:nth-child(2) p').text();
        const name = $(element).find('td:nth-child(3) a div p:first-child').text();
        const symbol = $(element).find('td:nth-child(3) a div p.coin-item-symbol').text();
        const price = $(element).find('td:nth-child(4) span').text();
        const marketCap = $(element).find('td:nth-child(8)').text();
        const volume = $(element).find('td:nth-child(9)').text();

        trendingCryptos.push({ rank, name, symbol, price, marketCap, volume });
    });

    return trendingCryptos;
}

async function getNewCryptos() {
    const $ = await fetchData(urlNew);
    let newCryptos = [];

    $('tr').slice(0, 5).each((index, element) => {
        const rank = $(element).find('td:nth-child(2) p').text();
        const name = $(element).find('td:nth-child(3) a div p:first-child').text();
        const symbol = $(element).find('td:nth-child(3) a div p.coin-item-symbol').text();
        const price = $(element).find('td:nth-child(4) div').text().trim();
        const marketCap = $(element).find('td:nth-child(7)').text();
        const volume = $(element).find('td:nth-child(8)').text();

        newCryptos.push({ rank, name, symbol, price, marketCap, volume });
    });

    return newCryptos;
}

async function getMostViewedCryptos() {
    const $ = await fetchData(urlMostViewed);
    let mostViewedCryptos = [];

    $('tr').slice(0, 5).each((index, element) => {
        const rank = $(element).find('td:nth-child(2) p').text();
        const name = $(element).find('td:nth-child(3) a div p:first-child').text();
        const symbol = $(element).find('td:nth-child(3) a div p.coin-item-symbol').text();
        const price = $(element).find('td:nth-child(4) span').text();
        const marketCap = $(element).find('td:nth-child(8)').text();
        const volume = $(element).find('td:nth-child(9)').text();

        mostViewedCryptos.push({ rank, name, symbol, price, marketCap, volume });
    });

    return mostViewedCryptos;
}

async function getExchanges() {
    const $ = await fetchData(urlExchanges);
    let exchanges = [];

    $('tr').slice(0, 5).each((index, element) => {
        const rank = $(element).find('td:nth-child(1) p').text();
        const name = $(element).find('td:nth-child(2) a div p:first-child').text();
        const score = $(element).find('td:nth-child(3) div').text();
        const volume24h = $(element).find('td:nth-child(4)').text();
        const markets = $(element).find('td:nth-child(5)').text();
        const visits = $(element).find('td:nth-child(6)').text();
        const coins = $(element).find('td:nth-child(7)').text();
        const pairs = $(element).find('td:nth-child(8)').text();

        exchanges.push({ rank, name, score, volume24h, markets, visits, coins, pairs });
    });

    return exchanges;
}

app.get('/api/crypto-data', async (req, res) => {
    try {
        const marketSummary = await getMarketSummary();
        const trendingCryptos = await getTrendingCryptos();
        const newCryptos = await getNewCryptos();
        const mostViewedCryptos = await getMostViewedCryptos();
        const exchanges = await getExchanges();

        res.json({
            marketSummary,
            trendingCryptos,
            newCryptos,
            mostViewedCryptos,
            exchanges
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while fetching data.' });
    }
});












async function generateResponse(userInput) {
    try {
      const response = await axios.post(`${apiEndpoint}/api/generate`, { input: userInput });
      return response.data; // Assuming API responds with the generated text
    } catch (error) {
      console.error('Error generating response:', error);
      throw new Error('Failed to generate response.');
    }
  }

















server.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
