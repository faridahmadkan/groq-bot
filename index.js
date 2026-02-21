const { Telegraf } = require('telegraf');
const Groq = require('groq-sdk');
const express = require('express');

// Check environment variables
if (!process.env.BOT_TOKEN || !process.env.GROQ_API_KEY) {
  console.error('❌ Missing BOT_TOKEN or GROQ_API_KEY');
  process.exit(1);
}

console.log('✅ Environment variables loaded');
console.log('BOT_TOKEN:', process.env.BOT_TOKEN ? 'Present' : 'Missing');
console.log('GROQ_API_KEY:', process.env.GROQ_API_KEY ? 'Present' : 'Missing');

const bot = new Telegraf(process.env.BOT_TOKEN);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const app = express();
const PORT = process.env.PORT || 3000;

// Store users who already received the promotion
const promotedUsers = new Set();

// ================= PROMOTIONAL MESSAGES =================
// English version (grammatically corrected)
const ENGLISH_PROMO = `
⚠️ *Notice:* 
Our service will stop soon. For the best AI chat experience, please visit:
👉 @TalkMatebot
`;

// Persian version (Farsi translation)
const PERSIAN_PROMO = `
⚠️ *توجه:* 
سرویس ما به زودی متوقف خواهد شد. برای بهترین تجربه چت با هوش مصنوعی، به آدرس زیر مراجعه کنید:
👉 @TalkMatebot
`;

// Web server for Render
app.get('/', (req, res) => res.send('Bot is running!'));
app.get('/health', (req, res) => res.status(200).send('OK'));

app.listen(PORT, '0.0.0.0', () => console.log(`✅ Server on port ${PORT}`));

// Simple in-memory storage for conversation history
const userConversations = new Map();

/**
 * Sends promotional message (only once per user)
 */
async function sendPromotion(ctx) {
  const userId = ctx.from.id;
  
  // Only send if user hasn't received promotion yet
  if (!promotedUsers.has(userId)) {
    promotedUsers.add(userId);
    
    // Send English version
    await ctx.reply(ENGLISH_PROMO, { parse_mode: 'Markdown' });
    
    // Send Persian version
    await ctx.reply(PERSIAN_PROMO, { parse_mode: 'Markdown' });
    
    // Send pointing sticker for attention
    try {
      await ctx.replyWithSticker('CAACAgIAAxkBAAEMmPZnvO-7WjNcYtX4Z5vT7rqR8r9sUQACAgADwDZPE7aQdR-D4II0NgQ');
    } catch (stickerError) {
      console.log('Sticker send failed (optional):', stickerError.message);
    }
    
    console.log(`✅ Promotion sent to user ${userId}`);
  }
}

/**
 * Gets AI response from Groq API with conversation history
 */
async function getAIResponse(userMessage, userId) {
  try {
    // Get or create user's conversation history
    if (!userConversations.has(userId)) {
      userConversations.set(userId, []);
    }
    const history = userConversations.get(userId);

    // Add user's new message to history
    history.push({ role: 'user', content: userMessage });

    // Keep history manageable (last 5 exchanges = 10 messages)
    const MAX_HISTORY = 10;
    if (history.length > MAX_HISTORY) {
      history.splice(0, history.length - MAX_HISTORY);
    }

    console.log(`🔄 Calling Groq API for user ${userId} with model: llama-3.3-70b-versatile`);
    
    // Call Groq API with working model
    const chatCompletion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile", // Latest working model
      messages: history,
      temperature: 0.7,
      max_tokens: 1024,
    });

    console.log('✅ Groq API response received');
    
    const aiReply = chatCompletion.choices[0]?.message?.content || 'I received an empty response.';

    // Add AI's reply to history
    history.push({ role: 'assistant', content: aiReply });

    return aiReply;

  } catch (error) {
    console.error('❌ Groq API Error Details:', JSON.stringify(error, null, 2));
    
    // Detailed error handling
    if (error.status === 401) {
      return '❌ Authentication Error: Your Groq API key is invalid. Please check the API key in Render environment variables.';
    } else if (error.status === 403) {
      return '❌ Authorization Error: Your API key does not have permission or your region is blocked. Try changing Render region to Oregon (US).';
    } else if (error.status === 404) {
      return '⚠️ Model not found. Please contact the admin.';
    } else if (error.status === 429) {
      return '⚡ Rate Limit: Too many requests. Please wait a moment.';
    } else if (error.code === 'ENOTFOUND') {
      return '🌐 Network Error: Cannot reach Groq API. Check your internet connection.';
    } else {
      return `⚠️ AI Service Error: ${error.message || 'Please try again later.'}`;
    }
  }
}

/**
 * Forwards user messages to the admin
 */
async function forwardToAdmin(ctx, userMessage) {
  try {
    const user = ctx.from;
    const adminMessage = `
👤 Message from user:
ID: ${user.id}
Name: ${user.first_name} ${user.last_name || ''}
Username: @${user.username || 'N/A'}

💬 Text:
${userMessage}

⏰ ${new Date().toLocaleString()}
    `.trim();

    await bot.telegram.sendMessage(process.env.ADMIN_CHAT_ID || '7826815609', adminMessage);
  } catch (error) {
    console.error('Failed to forward to admin:', error.message);
  }
}

/**
 * Splits long messages for Telegram
 */
function splitMessage(text, maxLength = 4096) {
  if (text.length <= maxLength) return [text];

  const parts = [];
  const lines = text.split('\n');
  let currentPart = '';

  for (const line of lines) {
    if (currentPart.length + line.length + 1 <= maxLength) {
      currentPart += (currentPart ? '\n' : '') + line;
    } else {
      if (currentPart) parts.push(currentPart);
      currentPart = line;
    }
  }

  if (currentPart) parts.push(currentPart);
  return parts;
}

// ================= BOT COMMANDS =================

// /start command
bot.start((ctx) => {
  const welcome = `🤖 Welcome ${ctx.from.first_name}!

I'm your AI assistant powered by Groq's fast language models. Created by Farid Ahmad Khan.

Commands:
/help - Show help
/clear - Clear chat history
/about - Bot info
/model - Show current AI model

Just send a message to start chatting!`;

  ctx.reply(welcome);

  // Notify admin
  bot.telegram.sendMessage(
    process.env.ADMIN_CHAT_ID || '7826815609',
    `🆕 New user started bot: ${ctx.from.first_name} (ID: ${ctx.from.id})`
  ).catch(console.error);
  
  // Send promotion on start
  sendPromotion(ctx);
});

// /help command
bot.help((ctx) => {
  ctx.reply(`Available commands:
/start - Start the bot
/help - Show this menu
/clear - Reset conversation
/about - About this bot
/model - Show current AI model

📨 All user messages are forwarded to the admin.`);
  
  // Send promotion on help
  sendPromotion(ctx);
});

// /clear command
bot.command('clear', (ctx) => {
  userConversations.delete(ctx.from.id);
  ctx.reply('✅ Conversation history cleared! Starting fresh.');
  
  // Send promotion on clear
  sendPromotion(ctx);
});

// /about command
bot.command('about', (ctx) => {
  ctx.reply(`🤖 Telegram AI Bot
Powered by Khan's AI Solutions
Model: llama-3.3-70b-versatile
Admin ID: ${process.env.ADMIN_CHAT_ID || '7826815609'}

Built for fast, intelligent conversations.`);
  
  // Send promotion on about
  sendPromotion(ctx);
});

// /model command
bot.command('model', (ctx) => {
  ctx.reply(`Current AI model: llama-3.3-70b-versatile

This is the latest Llama 3.3 model.`);
  
  // Send promotion on model
  sendPromotion(ctx);
});

// ================= MESSAGE HANDLING =================

// Handle text messages
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const userMessage = ctx.message.text;

  console.log(`📨 Message from ${userId}: ${userMessage.substring(0, 50)}`);

  // Show typing indicator
  await ctx.sendChatAction('typing');

  // Forward to admin (optional)
  await forwardToAdmin(ctx, userMessage).catch(() => {});

  // Get AI response
  const aiResponse = await getAIResponse(userMessage, userId);

  // Send response (split if too long)
  const messageParts = splitMessage(aiResponse);
  for (const part of messageParts) {
    await ctx.reply(part);
  }
  
  // Send promotion after response (only once per user)
  await sendPromotion(ctx);
});

// Handle non-text messages
bot.on(['photo', 'video', 'document', 'voice'], async (ctx) => {
  const mediaType = ctx.updateSubTypes[0];
  await ctx.reply(`📁 I received your ${mediaType}. Currently, I can only process text messages.`);

  // Forward media info to admin
  bot.telegram.sendMessage(
    process.env.ADMIN_CHAT_ID || '7826815609',
    `📎 User ${ctx.from.id} sent a ${mediaType}`
  ).catch(console.error);
  
  // Send promotion on media messages
  await sendPromotion(ctx);
});

// ================= ERROR HANDLING =================

bot.catch((err, ctx) => {
  console.error('Bot Error:', err);
  ctx.reply('❌ An internal error occurred. Please try again.').catch(() => {});
});

// ================= START BOT =================

bot.launch()
  .then(() => {
    console.log('✅ Bot is running!');
    console.log('🤖 Model: llama-3.3-70b-versatile');
    console.log('📢 Promotion message enabled:');
    console.log('   - English: Service stop notice with @TalkMatebot');
    console.log('   - Persian: Full translation');
    console.log('✅ Promotion will be sent once per user');
    
    // Send startup notification
    bot.telegram.sendMessage(
      process.env.ADMIN_CHAT_ID || '7826815609',
      `🤖 Groq Bot started successfully at ${new Date().toLocaleString()}\nModel: llama-3.3-70b-versatile\n📢 Promotion enabled for @TalkMatebot`
    ).catch(console.error);
  })
  .catch(err => {
    console.error('❌ Failed to start bot:', err);
    process.exit(1);
  });

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));