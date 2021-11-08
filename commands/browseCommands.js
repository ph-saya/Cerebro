const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageActionRow, MessageSelectMenu } = require('discord.js');
const { AuthorDao } = require('../dao/authorDao');
const { CardDao } = require('../dao/cardDao');
const { PackDao } = require('../dao/packDao');
const { SetDao } = require('../dao/setDao');
const { Imbibe } = require('../utilities/cardHelper');
const { CreateEmbed, RemoveComponents, SendContentAsEmbed } = require('../utilities/messageHelper');
const { LOAD_APOLOGY, INTERACT_APOLOGY } = require('../constants');

const SelectBox = async function(interaction, collectionEntities, type) {
    let selector = new MessageSelectMenu()
        .setCustomId('selector')
        .setPlaceholder(`No ${type} selected...`);

    let prompt = `${collectionEntities.length} results were found for the given query!`;

    if (collectionEntities.length > 25) {
        collectionEntities = collectionEntities.slice(0, 25);
        prompt += ' Only the top 25 results could be shown.';
    }

    prompt += '\n\nPlease select from the following...';
    
    for (let collectionEntity of collectionEntities) {
        let author = AuthorDao.AUTHORS.find(x => x.Id === collectionEntity.AuthorId);
        let description = `${collectionEntity.Type}${!collectionEntity.Official ? ` by ${author.Name}` : ''}`;

        selector.addOptions([{
            label: collectionEntity.Name,
            description: description,
            value: collectionEntity.Id
        }]);
    }

    let components = new MessageActionRow().addComponents(selector);

    let promise = SendContentAsEmbed(interaction, prompt, [components]);
    
    promise.then((message) => {
        let collector = message.createMessageComponentCollector({ componentType: 'SELECT_MENU', time: 20000 });

        collector.on('collect', async i => {
            if (i.user.id === interaction.member.id) {
                let collectionEntity = collectionEntities.find(x => x.Id === i.values[0]);

                collector.stop('selection');

                i.deferUpdate()
                .then(() => {
                    QueueCollectionResult(interaction, collectionEntity, type, message);
                });
            }
            else {
                i.reply({embeds: [CreateEmbed(INTERACT_APOLOGY)], ephemeral: true})
            }
        });

        collector.on('end', (i, reason) => {
            let content = 'The timeout was reached...';

            if (reason === 'selection') content = LOAD_APOLOGY;
            
            RemoveComponents(message, content);
        });
    });
}

const QueueCollectionResult = async function(interaction, collectionEntity, type, message = null) {
    let invertedType = type === 'pack' ? 'set' : 'pack';
    invertedType = invertedType.charAt(0).toUpperCase() + invertedType.slice(1);
    let collection = await CardDao.RetrieveByCollection(collectionEntity, invertedType);

    let card = collection.cards[0];
    let currentArtStyle = 0;
    let currentFace = collection.faces.length > 0 ? 0 : -1;
    let currentElement = 0;

    Imbibe(interaction, card, currentArtStyle, currentFace, currentElement, collection, false, false, message);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('browse')
        .setDescription('Browse all of the cards in a collection.')
        .addSubcommandGroup(subcommand =>
            subcommand
                .setName('official')
                .setDescription('Browse all of the cards in an official collection.')
                .addSubcommand(subsubcommand => 
                    subsubcommand
                        .setName('pack')
                        .setDescription('Browse all of the cards in an official pack.')
                        .addStringOption(option => option.setName('name').setDescription('The name of the pack being queried.').setRequired(true)))
                .addSubcommand(subsubcommand => 
                    subsubcommand
                        .setName('set')
                        .setDescription('Browse all of the cards in an official set.')
                        .addStringOption(option => option.setName('name').setDescription('The name of the set being queried.').setRequired(true))))
            .addSubcommandGroup(subcommand =>
                subcommand
                    .setName('unofficial')
                    .setDescription('Browse all of the cards in an unofficial collection.')
                    .addSubcommand(subsubcommand => 
                        subsubcommand
                            .setName('pack')
                            .setDescription('Browse all of the cards in an unofficial pack.')
                            .addStringOption(option => option.setName('name').setDescription('The name of the pack being queried.').setRequired(true)))
                    .addSubcommand(subsubcommand => 
                        subsubcommand
                            .setName('set')
                            .setDescription('Browse all of the cards in an unofficial set.')
                            .addStringOption(option => option.setName('name').setDescription('The name of the set being queried.').setRequired(true)))),
    async execute(interaction) {
        try {
            let official = interaction.options.getSubcommandGroup() === 'official';
            let type = interaction.options.getSubcommand();
            let invertedType = type === 'pack' ? 'set' : 'pack';
            let query = interaction.options.getString('name').toLowerCase();

            let convertedQuery = query.normalize('NFD').replace(/[^a-z0-9 -]/gmi, '').toLowerCase();
            let queryTokens = convertedQuery.replace(/[-]/gmi, ' ').split(' ');
            let strippedQuery = convertedQuery.replace(/[^a-z0-9]/gmi, '');

            let collections = invertedType === 'pack' ? PackDao.PACKS : SetDao.SETS;

            let results = collections.filter(collection => {
                if (collection.Official != official) return false;

                let convertedCollectionName = collection.Name.normalize('NFD').replace(/[^a-z0-9 -]/gmi, '').toLowerCase();
                let collectionNameTokens = convertedCollectionName.replace(/[-]/gmi, ' ').split(' ');
                let strippedCollectionName = convertedCollectionName.replace(/[^a-z0-9]/gmi, '');

                if (convertedCollectionName === convertedQuery) return true;
                else {
                    if (queryTokens.every(x => collectionNameTokens.includes(x))) return true;
                    else {
                        if (strippedCollectionName.includes(strippedQuery)) return true;
                        else return false;
                    }
                }
            });
            
            if (!results || results.length === 0) SendContentAsEmbed(interaction, 'No results were found for the given query...');
            else if (results.length > 1) SelectBox(interaction, results, type);
            else if (results.length === 1) QueueCollectionResult(interaction, results[0], type);
        }
        catch (e) {
            console.log(e);
            SendContentAsEmbed(interaction, 'Something went wrong... Check the logs to find out more.');
        }
    }
}