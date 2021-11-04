const { MessageEmbed } = require("discord.js");
const Constants = require("../constants");

var CreateEmbed = exports.CreateEmbed = function(content, color = Constants.COLORS.Default, title = null) {
    const embed = new MessageEmbed()
        .setColor(color)
        .setDescription(content);

    if (title != null) embed.setTitle(title);

    return embed;
}

exports.RemoveComponents = function(message, content, removeFiles = true) {
    var messageOptions = {
        components: []
    };

    if (removeFiles) {
        messageOptions.attachments = [];
        messageOptions.files = [];
    }

    if (content) messageOptions.embeds = [CreateEmbed(content)];

    message.edit(messageOptions);
}

exports.SendContentAsEmbed = function(context, content, components = null, ephemeral = false) {
    var embed = CreateEmbed(content);

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