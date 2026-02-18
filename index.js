const { Telegraf } = require('telegraf');
const Groq = require('groq-sdk');
const express = require('express');

// Check environment variables
if (!process.env.BOT_TOKEN || !process.env.GROQ_API_KEY) {
  console.error('Missing BOT_TOKEN or GROQ_API_KEY');
  process.exit(1);
}

console.log('✅ Environment variables loaded');
console.log('BOT_TOKEN:', process.env.BOT_TOKEN ? 'Present' : 'Missing');
console.log('GROQ_API_KEY:', process.env.GROQ_API_KEY ? 'Present' : 'Missing');

const bot = new Telegraf(process.env.BOT_TOKEN);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const app = express();
const PORT = process.env.PORT || 3000;

// Web server for Render
app.get('/', (req, res) => res.send('Bot is running!'));
app.get('/health', (req, res) => res.status(200).send('OK'));

app.listen(PORT, '0.0.0.0', () => console.log(`✅ Server on port ${PORT}`));

// Bot commands
bot.start((ctx) => {
  console.log(`/start from user: ${ctx.from.id}`);
  ctx.reply(`🤖 Welcome ${ctx.from.first_name}! I'm your AI assistant.`);
});

bot.help((ctx) => {
  ctx.reply(`Available commands:
/start - Welcome message
/help - This menu
/clear - Reset conversation
/about - Bot info
/model - Show AI model`);
});

bot.command('clear', (ctx) => {
  ctx.reply('✅ Conversation cleared!');
});

bot.command('about', (ctx) => {
  ctx.reply(`🤖 Telegram AI Bot
Created by Farid Ahmad Khan
Model: mixtral-8x7b-32768`);
});

bot.command('model', (ctx) => {
  ctx.reply('Current model: mixtral-8x7b-32768');
});

// Handle text messages
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const userMessage = ctx.message.text;
  
  console.log(`📨 Message from ${userId}: ${userMessage.substring(0, 50)}`);
  
  try {
    await ctx.sendChatAction('typing');
    
    console.log('🔄 Calling Groq API...');
    
    // Try different model if this fails
    const response = await groq.chat.completions.create({
      model: "mixtral-8x7b-32768",  // You can try other models too
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 500
    });
    
    console.log('✅ Groq API response received');
    
    const aiReply = response.choices[0].message.content;
    await ctx.reply(aiReply);
    
  } catch (error) {
    console.error('❌ ERROR DETAILS:', error);
    
    // Try to send detailed error to admin/console
    let errorMessage = 'Sorry, an error occurred.';
    
    if (error.status === 401) {
      errorMessage = '❌ Invalid API key. Please check GROQ_API_KEY.';
    } else if (error.status === 429) {
      errorMessage = '⚠️ Rate limit exceeded. Please try again later.';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = '🌐 Network error. Cannot reach API.';
    } else if (error.message) {
      errorMessage = `⚠️ Error: ${error.message.substring(0, 100)}`;
    }
    
    await ctx.reply(errorMessage);
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
});

// Launch bot
bot.launch()
  .then(() => console.log('✅ Bot is running!'))
  .catch(err => {
    console.error('❌ Failed to start bot:', err);
    process.exit(1);
  });

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));