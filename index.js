const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
} = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ===================== CONFIG =====================
const TOKEN = process.env.TOKEN || 'YOUR_BOT_TOKEN';
const CLIENT_ID = process.env.CLIENT_ID || 'YOUR_CLIENT_ID';

function loadAdmins() {
  try {
    const data = fs.readFileSync(path.join(__dirname, 'admins.json'), 'utf8');
    return JSON.parse(data).admins || [];
  } catch (e) {
    console.error('Không đọc được admins.json:', e.message);
    return [];
  }
}

function isAdmin(userId) {
  return loadAdmins().includes(userId);
}

// ===================== EXPRESS (UptimeRobot) =====================
const app = express();
app.get('/', (req, res) => res.send('Bot đang chạy!'));
app.listen(3000, () => console.log('Web server chạy tại port 3000'));

// ===================== DISCORD CLIENT =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// ===================== SLASH COMMANDS =====================
const commands = [
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Xem danh sach lenh'),

  new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Khoa kenh hien tai (chi Admin)'),

  new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Mo khoa kenh hien tai (chi Admin)'),

  new SlashCommandBuilder()
    .setName('role')
    .setDescription('Them role cho user (chi Admin)')
    .addUserOption(opt =>
      opt.setName('user').setDescription('Chon user').setRequired(true)
    )
    .addRoleOption(opt =>
      opt.setName('role').setDescription('Chon role muon them').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('deleterole')
    .setDescription('Xoa role khoi user (chi Admin)')
    .addUserOption(opt =>
      opt.setName('user').setDescription('Chon user').setRequired(true)
    )
    .addRoleOption(opt =>
      opt.setName('role').setDescription('Chon role muon xoa').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('addrole')
    .setDescription('Tao role moi trong server (chi Admin)')
    .addStringOption(opt =>
      opt.setName('ten').setDescription('Ten cua role').setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('mau')
        .setDescription('Mau hex VD: #FF0000')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Xoa tin nhan trong kenh (chi Admin)')
    .addIntegerOption(opt =>
      opt.setName('soluong')
        .setDescription('So tin nhan muon xoa (1 - 100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    ),

].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
  console.log(`Bot online: ${client.user.tag}`);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('Da dang ky slash commands!');
  } catch (err) {
    console.error('Loi dang ky lenh:', err);
  }
});

// ===================== SLASH COMMAND HANDLER =====================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user, member, guild, channel } = interaction;

  // -------- /help --------
  if (commandName === 'help') {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📋 Danh sách lệnh Bot')
      .addFields(
        {
          name: '👤 Lệnh mọi người dùng được',
          value: [
            '`.name [tên]` — Đổi nickname của bạn trong server',
            '`/help` — Hiển thị danh sách lệnh',
          ].join('\n'),
        },
        {
          name: '🔐 Lệnh Admin',
          value: [
            '`/lock` hoặc `.lock` — 🔒 Khóa kênh hiện tại',
            '`/unlock` hoặc `.unlock` — 🔓 Mở khóa kênh hiện tại',
            '`/role @user @role` — ➕ Thêm role cho thành viên',
            '`/deleterole @user @role` — 🗑️ Xóa role khỏi thành viên',
            '`/addrole [tên] [màu]` — 🎨 Tạo role mới',
            '`/clear [số lượng]` — 🧹 Xóa tin nhắn trong kênh',
          ].join('\n'),
        }
      )
      .setFooter({ text: 'Chỉ Admin mới dùng được lệnh có khóa 🔐' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // -------- /lock --------
  if (commandName === 'lock') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ Bạn không có quyền khóa kênh!', ephemeral: true });
    }
    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: false,
        AddReactions: false,
        SendMessagesInThreads: false,
      });
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('🔒 Kênh đã bị khóa')
        .setDescription(`Kênh **#${channel.name}** đã bị khóa bởi ${user}\nMọi người không thể nhắn tin cho đến khi được mở khóa.`)
        .setTimestamp();
      interaction.reply({ embeds: [embed] });
    } catch (err) {
      interaction.reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true });
    }
  }

  // -------- /unlock --------
  if (commandName === 'unlock') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ Bạn không có quyền mở khóa kênh!', ephemeral: true });
    }
    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: null,
        AddReactions: null,
        SendMessagesInThreads: null,
      });
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🔓 Kênh đã được mở khóa')
        .setDescription(`Kênh **#${channel.name}** đã được mở khóa bởi ${user}\nMọi người có thể nhắn tin bình thường!`)
        .setTimestamp();
      interaction.reply({ embeds: [embed] });
    } catch (err) {
      interaction.reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true });
    }
  }

  // -------- /role @user @role --------
  if (commandName === 'role') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ content: '❌ Bạn không có quyền thêm role!', ephemeral: true });
    }
    const targetUser = interaction.options.getMember('user');
    const targetRole = interaction.options.getRole('role');

    if (!targetUser || !targetRole) {
      return interaction.reply({ content: '❌ Không tìm thấy user hoặc role!', ephemeral: true });
    }

    if (targetUser.roles.cache.has(targetRole.id)) {
      return interaction.reply({
        content: `❌ **${targetUser.user.username}** đã có role **${targetRole.name}** rồi!`,
        ephemeral: true
      });
    }

    try {
      await targetUser.roles.add(targetRole);
      const embed = new EmbedBuilder()
        .setColor(targetRole.color || 0x5865F2)
        .setTitle('✅ Đã thêm Role')
        .setDescription(`Đã thêm role **${targetRole.name}** cho ${targetUser.user}\nThực hiện bởi: ${user}`)
        .setTimestamp();
      interaction.reply({ embeds: [embed] });
    } catch (err) {
      interaction.reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true });
    }
  }

  // -------- /deleterole @user @role --------
  if (commandName === 'deleterole') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ content: '❌ Bạn không có quyền xóa role!', ephemeral: true });
    }
    const targetUser = interaction.options.getMember('user');
    const targetRole = interaction.options.getRole('role');

    if (!targetUser || !targetRole) {
      return interaction.reply({ content: '❌ Không tìm thấy user hoặc role!', ephemeral: true });
    }

    if (!targetUser.roles.cache.has(targetRole.id)) {
      return interaction.reply({
        content: `❌ **${targetUser.user.username}** không có role **${targetRole.name}**!`,
        ephemeral: true
      });
    }

    try {
      await targetUser.roles.remove(targetRole);
      const embed = new EmbedBuilder()
        .setColor(0xFF6600)
        .setTitle('🗑️ Đã xóa Role')
        .setDescription(`Đã xóa role **${targetRole.name}** khỏi ${targetUser.user}\nThực hiện bởi: ${user}`)
        .setTimestamp();
      interaction.reply({ embeds: [embed] });
    } catch (err) {
      interaction.reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true });
    }
  }

  // -------- /addrole [tên] [màu] --------
  if (commandName === 'addrole') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ content: '❌ Bạn không có quyền tạo role!', ephemeral: true });
    }

    const roleName = interaction.options.getString('ten');
    const roleColor = interaction.options.getString('mau');

    const hexRegex = /^#([0-9A-Fa-f]{6})$/;
    if (!hexRegex.test(roleColor)) {
      return interaction.reply({
        content: '❌ Màu không hợp lệ! Dùng định dạng hex VD: `#FF0000`',
        ephemeral: true
      });
    }

    const existingRole = guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
    if (existingRole) {
      return interaction.reply({
        content: `❌ Role **${roleName}** đã tồn tại rồi!`,
        ephemeral: true
      });
    }

    try {
      const newRole = await guild.roles.create({
        name: roleName,
        color: roleColor,
        permissions: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        reason: `Tao boi ${user.tag}`,
      });

      const embed = new EmbedBuilder()
        .setColor(newRole.color)
        .setTitle('🎨 Đã tạo Role mới')
        .addFields(
          { name: '📛 Tên', value: newRole.name, inline: true },
          { name: '🎨 Màu', value: roleColor, inline: true },
          { name: '✅ Quyền mặc định', value: 'Xem kênh, Xem lịch sử tin nhắn', inline: false },
        )
        .setFooter({ text: `Tao boi ${user.tag}` })
        .setTimestamp();

      interaction.reply({ embeds: [embed] });
    } catch (err) {
      interaction.reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true });
    }
  }

  // -------- /clear [số lượng] --------
  if (commandName === 'clear') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ Bạn không có quyền xóa tin nhắn!', ephemeral: true });
    }

    const amount = interaction.options.getInteger('soluong');

    try {
      await interaction.deferReply({ ephemeral: true });

      const messages = await channel.messages.fetch({ limit: amount });

      // Discord chỉ cho bulk delete tin nhắn dưới 14 ngày
      const deletable = messages.filter(msg => {
        const age = Date.now() - msg.createdTimestamp;
        return age < 14 * 24 * 60 * 60 * 1000;
      });

      if (deletable.size === 0) {
        return interaction.editReply('❌ Không có tin nhắn nào có thể xóa! Tin nhắn quá 14 ngày Discord không cho xóa hàng loạt.');
      }

      await channel.bulkDelete(deletable, true);

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🧹 Đã xóa tin nhắn')
        .setDescription(`Đã xóa **${deletable.size}** tin nhắn trong kênh **#${channel.name}**\nThực hiện bởi: ${user}`)
        .setTimestamp();

      const reply = await interaction.editReply({ embeds: [embed], ephemeral: false });

      // Tự xóa thông báo sau 5 giây
      setTimeout(async () => {
        try { await reply.delete(); } catch {}
      }, 5000);

    } catch (err) {
      try {
        interaction.editReply({ content: `❌ Lỗi: ${err.message}` });
      } catch {}
    }
  }
});

// ===================== PREFIX COMMAND HANDLER =====================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();
  const member = message.member;
  const guild = message.guild;
  const channel = message.channel;

  // -------- .name [tên] --------
  if (content.startsWith('.name ')) {
    const newName = content.slice(6).trim();
    if (!newName) return message.reply('❌ Vui lòng nhập tên! VD: `.name TênMới`');
    if (newName.length > 32) return message.reply('❌ Tên quá dài! Tối đa 32 ký tự.');
    try {
      await member.setNickname(newName);
      message.reply(`✅ Đã đổi nickname thành **${newName}**!`);
    } catch (err) {
      message.reply('❌ Không thể đổi tên! Bot cần role cao hơn bạn.');
    }
  }

  // -------- .lock --------
  if (content === '.lock') {
    if (!isAdmin(message.author.id) && !member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply('❌ Bạn không có quyền khóa kênh!');
    }
    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: false,
        AddReactions: false,
        SendMessagesInThreads: false,
      });
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('🔒 Kênh đã bị khóa')
        .setDescription(`Kênh **#${channel.name}** đã bị khóa bởi ${message.author}\nMọi người không thể nhắn tin cho đến khi được mở khóa.`)
        .setTimestamp();
      channel.send({ embeds: [embed] });
    } catch (err) {
      message.reply(`❌ Lỗi: ${err.message}`);
    }
  }

  // -------- .unlock --------
  if (content === '.unlock') {
    if (!isAdmin(message.author.id) && !member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply('❌ Bạn không có quyền mở khóa kênh!');
    }
    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: null,
        AddReactions: null,
        SendMessagesInThreads: null,
      });
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🔓 Kênh đã được mở khóa')
        .setDescription(`Kênh **#${channel.name}** đã được mở khóa bởi ${message.author}\nMọi người có thể nhắn tin bình thường!`)
        .setTimestamp();
      channel.send({ embeds: [embed] });
    } catch (err) {
      message.reply(`❌ Lỗi: ${err.message}`);
    }
  }
});

// ===================== LOGIN =====================
client.login(TOKEN);
