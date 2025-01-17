require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const app = express();
const port = 3000;

const server = http.createServer(app);
const io = socketIo(server);

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

app.use(bodyParser.json());
app.use(express.static('public'));

function sendEvent(socket, message) {
  socket.emit('consoleMessage', message);
}

// Function to save cookies
async function saveCookies(page, filePath) {
  const cookies = await page.cookies();
  fs.writeFileSync(filePath, JSON.stringify(cookies, null, 2));
}

// Function to load cookies
async function loadCookies(page, filePath) {
  const cookies = JSON.parse(fs.readFileSync(filePath));
  await page.setCookie(...cookies);
}

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
  const cookiesPath = path.join(__dirname, 'cookies.json');

  try {
    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--window-size=1920x1080',
        '--disable-dev-shm-usage',
        '--single-process',
        '--no-zygote',
        '--disable-gpu',
        '--dns-prefetch-disable',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
    });

    const page = await browser.newPage();

    if (fs.existsSync(cookiesPath)) {
      await loadCookies(page, cookiesPath);
      await page.goto('https://twitter.com/home', { waitUntil: 'networkidle2' });
      sendEvent(socket, 'Loaded cookies and navigated to Twitter.');
    } else {
      sendEvent(socket, 'Logging in to Twitter...');
      await page.goto('https://twitter.com/login', { waitUntil: 'networkidle2' });
      
      await page.waitForSelector('input[name="text"]', { visible: true, timeout: 60000 });
      await page.type('input[name="text"]', 'YashSha73564414');
      await page.keyboard.press('Enter');
      
      sendEvent(socket, 'Waiting for password input...');
      await page.waitForSelector('input[name="password"]', { visible: true, timeout: 60000 });
      await page.type('input[name="password"]', 'yshah123r');
      await page.keyboard.press('Enter');
      
      sendEvent(socket, 'Waiting for navigation after login...');
      await page.waitForNavigation({ waitUntil: 'networkidle2' });
      
      sendEvent(socket, 'Login successful!');
      await saveCookies(page, cookiesPath);
      sendEvent(socket, 'Cookies saved successfully.');
    }

    sendEvent(socket, 'Attempting to post tweet...');
    await page.waitForSelector('div[data-testid="tweetTextarea_0"]', { visible: true, timeout: 60000 });
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

server.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
