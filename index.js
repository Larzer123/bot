const { Client, GatewayIntentBits, Partials, ButtonBuilder, ButtonStyle, ActionRowBuilder, Events, SlashCommandBuilder, REST, Routes, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { TrueWalletVoucher } = require('voucher-ts');
const fs = require('fs');
require('dotenv').config();

const config = {
  admin_ids: process.env.ADMIN_IDS.split(','),
  wallet_mobile: process.env.WALLET_MOBILE,
  report_channel_id: process.env.REPORT_CHANNEL_ID,
  roles: JSON.parse(process.env.ROLES)
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction
  ]
});

// สร้างคำสั่ง /setup
const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('เปิดหน้าต่างซื้อยศ (แอดมินเท่านั้น)')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'setup') {
      if (!config.admin_ids.includes(interaction.user.id)) {
        return interaction.reply({ content: '❌ คุณไม่มีสิทธิ์ใช้งานคำสั่งนี้', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle("【】UMI BOT")
        .setDescription([
          "🕒 ซื้่อยศอัตโนมัติ 24 ชั่วโมง",
          "・กดปุ่ม \"เติมเงิน\" เพื่อซื้อยศ",
          "・กดปุ่ม \"ราคายศ\" เพื่อดูราคายศ",
        ].join("\n"))
        .setColor("#fdb8b8")
        .setImage("https://i.pinimg.com/736x/e5/7d/43/e57d43d194a5fe4eb2880dfb8c5f3756.jpg")
        .setFooter({ text: "UMI BOT  |  เติมยศอัตโนมัติ" })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("redeem_btn")
          .setLabel("🧧 เติมเงิน")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("price_btn")
          .setLabel("🛒 ราคาทั้งหมด")
          .setStyle(ButtonStyle.Success)
      );

      await interaction.reply({
        embeds: [embed],
        components: [row],
      });
    }
  } else if (interaction.isButton()) {
    if (interaction.customId === 'price_btn') {
      const priceList = config.roles
        .sort((a, b) => a.amount - b.amount)
        .map((r) => `เติมเงิน ${r.amount} บาท จะได้รับยศ\n彡 <@&${r.role_id}>\n╭──╯ . . . . .۝. . . . . ╰──╮`)
        .join("\n\n");

      const embed = new EmbedBuilder()
        .setTitle("🛒 ราคายศทั้งหมด")
        .setDescription(priceList)
        .setColor("#fdb8b8")
        .setFooter({ text: "ระบบเติมยศอัตโนมัติ |  BOT" })
        .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }

    if (interaction.customId === "redeem_btn") {
      const modal = new ModalBuilder()
        .setCustomId('redeemModal')
        .setTitle('เติมเงินซองทรูมันนี่');

      const linkInput = new TextInputBuilder()
        .setCustomId('voucherLink')
        .setLabel("วางลิงก์ซองทรูมันนี่ที่นี่")
        .setPlaceholder("https://gift.truemoney.com/campaign/?v=xxxxxxxxxxx")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const firstActionRow = new ActionRowBuilder().addComponents(linkInput);
      modal.addComponents(firstActionRow);

      await interaction.showModal(modal);
    }
  } else if (interaction.isModalSubmit()) {
    if (interaction.customId === 'redeemModal') {
      const voucherLink = interaction.fields.getTextInputValue('voucherLink');
      
      if (!voucherLink.includes("gift.truemoney.com")) {
        return interaction.reply({
          content: "❌ ลิงก์ไม่ถูกต้อง กรุณาใช้ลิงก์ซองทรูมันนี่ที่ถูกต้อง",
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const wallet = new TrueWalletVoucher({ mobile: process.env.WALLET_MOBILE });

      try {
        const result = await wallet.redeem(voucherLink);
        if ("error" in result) {
          return interaction.followUp({ content: `❌ ลิงก์ผิด: ${result.error.message}`, ephemeral: true });
        }

        const amount = result.amount;
        // หา role ที่มี amount ตรงกับที่เติมพอดีเท่านั้น
        const matchedRole = config.roles.find(r => r.amount === amount);

        if (!matchedRole) {
          const validAmounts = config.roles.map(r => r.amount).sort((a, b) => a - b);
          return interaction.followUp({ 
            content: `❌ จำนวนเงิน ${amount} บาท ไม่ตรงกับยศใดๆ ที่กำหนดไว้\n\n` +
                     `กรุณาเติมตามจำนวนเหล่านี้เท่านั้น:\n` +
                     `${validAmounts.map(a => `- ${a} บาท`).join('\n')}`,
            ephemeral: true 
          });
        }

        const member = await interaction.guild.members.fetch(interaction.user.id);
        await member.roles.add(matchedRole.role_id);

        const report = await client.channels.fetch(config.report_channel_id);
        await report.send(`🧾 <@${interaction.user.id}> เติมเงิน **${amount} บาท** ได้รับยศ <@&${matchedRole.role_id}>`);

        return interaction.followUp({ 
          content: `✅ คุณได้รับยศ <@&${matchedRole.role_id}> แล้ว`, 
          ephemeral: true 
        });

      } catch (err) {
        console.error(err);
        return interaction.followUp({ 
          content: "❌ เกิดข้อผิดพลาดระหว่าง Redeem", 
          ephemeral: true 
        });
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);