const { Telegraf } = require('telegraf');
const Groq = require('groq-sdk');
const express = require('express');

// Check environment variables
if (!process.env.BOT_TOKEN || !process.env.GROQ_API_KEY) {
  console.error('Missing BOT_TOKEN or GROQ_API_KEY');
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const app = express();
const PORT = process.env.PORT || 3000;

// Web server for Render
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, '0.0.0.0', () => console.log(`Server on port ${PORT}`));

// Bot commands
bot.start((ctx) => ctx.reply(`Welcome ${ctx.from.first_name}! I'm your AI assistant.`));

bot.on('text', async (ctx) => {
  try {
    await ctx.sendChatAction('typing');
    
    const response = await groq.chat.completions.create({
      model: "mixtral-8x7b-32768",
      messages: [{ role: 'user', content: ctx.message.text }],
    });
    
    await ctx.reply(response.choices[0].message.content);
  } catch (error) {
    console.error(error);
    await ctx.reply('Sorry, an error occurred.');
  }
});

// Launch bot
bot.launch().then(() => console.log('Bot running!'));

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));