const { MessageEmbed } = require("discord.js");
const { COLORS, PRODUCTION_BOT, WIZARD, ACOLYTE } = require("../constants");
const { ConfigurationDao } = require("../dao/configurationDao");

exports.Authorized = function(context, adminLocked = false) {
    let userId = context.user ? context.user.id : context.author ? context.author.id : context.member.id;

    if (adminLocked && userId !== WIZARD) {
        SendContentAsEmbed(context, "Only the bot administrator can use this command!", null, true);
        return false;
    }
    
    if (context.client.user.id != PRODUCTION_BOT && !ConfigurationDao.CONFIGURATION.Donors.concat([WIZARD, ACOLYTE]).includes(userId)) {
        SendContentAsEmbed(context, "You do not possess beta access!", null, true);
        return false;
    }

    if (context.guildId) {
        let permissions = context.client.guilds.cache.get(context.guildId).me.permissionsIn(context.channelId);

        if (!permissions.has('VIEW_CHANNEL') || !permissions.has('SEND_MESSAGES') || !permissions.has('MANAGE_MESSAGES')) {
            SendContentAsEmbed(context, "I don't have sufficient permissions here!", null, true);
            return false;
        }
    }
    
    return true;
}

let CreateEmbed = exports.CreateEmbed = function(content, color = COLORS.Default, title = null) {
    const embed = new MessageEmbed()
        .setColor(color)
        .setDescription(content);

    if (title != null) embed.setTitle(title);

    return embed;
}

exports.RemoveComponents = function(message, content, removeFiles = true) {
    let messageOptions = {
        components: []
    };

    if (removeFiles) {
        messageOptions.attachments = [];
        messageOptions.files = [];
    }

    if (content) messageOptions.embeds = [CreateEmbed(content)];

    message.edit(messageOptions);
}

let SendContentAsEmbed = exports.SendContentAsEmbed = function(context, content, components = null, ephemeral = false) {
    let embed = CreateEmbed(content);

    return context.reply({
        allowedMentions: {
            repliedUser: false
        },
        components: components,
        embeds: [embed],
        ephemeral: ephemeral,
        fetchReply: true
    });
}

exports.SendMessageWithOptions = function(context, options, ephemeral = false) {
    options.allowedMentions = {
        repliedUser: false
    };
    options.ephemeral = ephemeral;
    options.fetchReply = true;

    return context.reply(options);
}