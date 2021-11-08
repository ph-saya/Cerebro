const { Formatters, MessageActionRow, MessageButton, MessageEmbed, Util } = require('discord.js');
const { RuleDao } = require('../dao/ruleDao');
const { SetDao } = require('../dao/setDao');
const { CreateEmbed, RemoveComponents, SendMessageWithOptions } = require('../utilities/messageHelper');
const { Summary } = require('./printingHelper');
const { FormatSymbols, FormatText, SpoilerIfIncomplete, QuoteText, ItalicizeText } = require('./stringHelper');
const { AFFIRMATIVE_EMOJI, COLORS, ID_LENGTH, INTERACT_APOLOGY, LOAD_APOLOGY, NEGATIVE_EMOJI, SYMBOLS } = require('../constants');

const BuildCardImagePath = exports.BuildCardImagePath = function(card, artStyle) {
    return `${process.env.cardImagePrefix}${card.Official ? 'official/' : `unofficial/`}${artStyle}.jpg`;
}

const BuildEmbed = exports.BuildEmbed = function(card, alternateArt = null) {
    let embed = new MessageEmbed();

    let description = [];
    let subheader = [BuildHeader(card)];

    if (card.Traits) subheader.push(ItalicizeText(Formatters.bold(card.Traits.join(', '))));

    description.push(SpoilerIfIncomplete(subheader.join('\n'), card.Incomplete));

    let stats = BuildStats(card);

    if (stats.length > 0) {
        stats = FormatSymbols(stats);

        description.push(SpoilerIfIncomplete(stats, card.Incomplete));
    }

    let body = [];

    if (card.Rules) {
        let formattedRules = FormatText(card.Rules, card.Name);

        body.push(QuoteText(SpoilerIfIncomplete(formattedRules, card.Incomplete)));
    }

    if (card.Special) {
        let formattedSpecial = FormatText(card.Special, card.Name);

        body.push(QuoteText(SpoilerIfIncomplete(formattedSpecial, card.Incomplete)));
    }

    if (card.Flavor) {
        let escapedFlavor = Util.escapeMarkdown(card.Flavor);

        body.push(SpoilerIfIncomplete(ItalicizeText(escapedFlavor), card.Incomplete));
    }

    if (!card.Official) body.push(BuildCredits(card));

    if (body.length > 0) description.push(body.join('\n\n'));

    let image = BuildCardImagePath(card, alternateArt ?? card.Id);

    embed.setColor(COLORS[(card.Type == 'Villain' || card.Type == 'Main Scheme' ? 'Villain' : card.Classification)]);
    embed.setTitle(SpoilerIfIncomplete((card.Unique ? SYMBOLS['{u}'] : '') + card.Name + (card.Subname ? ` — ${card.Subname}` : '' ), card.Incomplete));
    embed.setURL(image);
    embed.setDescription(description.join('\n\n'));
    embed.setFooter(BuildFooter(card));

    let printing = GetPrintingByArtificialId(card, alternateArt ?? card.Id);
    let set = SetDao.SETS.find(x => x.Id === printing.SetId);
    
    if (!card.Incomplete && !set.Incomplete) embed.setThumbnail(image);

    return embed;
}

const BuildCredits = exports.BuildCredits = function(card) {
    let set = SetDao.SETS.find(x => x.Id === GetPrintingByArtificialId(card, card.Id).SetId);

    let credits = [];

    credits.push(`${Formatters.bold('Author')}: <@${card.AuthorId}>`);
    if (set.CouncilNumber) credits.push(`${AFFIRMATIVE_EMOJI} Released in Council Set #${set.CouncilNumber}!`);
    else credits.push(`${NEGATIVE_EMOJI} Not yet released...`);

    return credits.join('\n');
}

const BuildFooter = exports.BuildFooter = function(card) {
    let reprints = card.Printings.filter(x => x.ArtificialId != card.Id);

    let footer = [];

    footer.push(Summary(GetPrintingByArtificialId(card, card.Id)));

    if (reprints.length > 0 && reprints.length <= 3) {
        for (let printing of reprints) footer.push(Summary(printing));
    }
    else if (reprints.length > 3) {
        for (let i = 0; i < 2; i++) footer.push(Summary(reprints[i]));

        footer.push(`...and ${reprints.length - 2} more reprints.`);
    }

    return footer.join('\n');
}

const BuildHeader = exports.BuildHeader = function(card) {
    let header = '';

    if (card.Classification != 'Encounter' && card.Type != 'Hero' && card.Type != 'Alter-Ego') header += `${Formatters.bold(card.Classification)} `;

    header += Formatters.bold(card.Type);

    if (card.Stage) header += ` — ${Formatters.italic(`Stage ${card.Stage}`)}`;

    return header;
}

const BuildRulesEmbed = exports.BuildRulesEmbed = function(card, alternateArt = null) {
    let embed = new MessageEmbed();
    let image = BuildCardImagePath(card, alternateArt ?? card.Id);
    let ruleEntries = EvaluateRules(card);

    for (let ruleEntry of ruleEntries) {
        embed.addField(FormatSymbols(ruleEntry.title), FormatSymbols(ruleEntry.description));
    }

    embed.setColor(COLORS[(card.Type == 'Villain' || card.Type == 'Main Scheme' ? 'Villain' : card.Classification)]);
    embed.setTitle(SpoilerIfIncomplete((card.Unique ? SYMBOLS['{u}'] : '') + card.Name + (card.Subname != null ? ` — ${card.Subname}` : '' ), card.Incomplete));
    embed.setURL(image);
    embed.setFooter(BuildFooter(card));

    let printing = GetPrintingByArtificialId(card, alternateArt ?? card.Id);
    let set = SetDao.SETS.find(x => x.Id === printing.SetId);
    
    if (!card.Incomplete && !set.Incomplete) embed.setThumbnail(image);

    return embed;
}

const BuildStats = exports.BuildStats = function(card) {
    let components = [];

    let hasEconomy = card.Cost != null || card.Resource != null || card.Boost != null;
    let hasAbilities = card.Recover != null || card.Scheme != null || card.Thwart != null || card.Attack != null || card.Defense != null;
    let hasFeatures = card.Hand != null || card.Health != null || card.Acceleration != null || card.StartingThreat != null;

    if (hasEconomy)
    {
        let economy = [];

        if (card.Cost) economy.push(`Cost: ${card.Cost}`);

        if (card.Resource) economy.push(`Resource: ${card.Resource}`);

        if (card.Boost) economy.push(`Boost: ${card.Boost}`);

        components.push(economy.join('\n'));
    }

    if (hasAbilities)
    {
        let abilities = [];

        if (card.Recover) abilities.push(`REC: ${card.Recover}`);

        if (card.Scheme)
        {
            let suffix = card.Slash ? '/THW' : '';
            abilities.push(`SCH${suffix}: ${card.Scheme}`);
        }

        if (card.Thwart)
        {
            let prefix = card.Slash ? 'SCH/' : '';
            abilities.push(`${prefix}THW: ${card.Thwart}`);
        }

        if (card.Attack) abilities.push(`ATK: ${card.Attack}`);

        if (card.Defense) abilities.push(`DEF: ${card.Defense}`);

        components.push(abilities.join('\n'));
    }

    if (hasFeatures)
    {
        let features = [];

        if (card.Hand) features.push(`Hand Size: ${card.Hand}`);

        if (card.Health) features.push(`Health: ${card.Health}`);

        if (card.StartingThreat) features.push(`Starting Threat: ${card.StartingThreat}`);

        if (card.Acceleration) features.push(`Acceleration: ${card.Acceleration}`);

        if (card.TargetThreat) features.push(`Target Threat: ${card.TargetThreat}`);

        components.push(features.join('\n'));
    }

    return components.join('\n\n');
}

const EvaluateRules = exports.EvaluateRules = function(card) {
    if (!card.Rules && !card.Special) return null;

    let rules = [];

    for (let rule of RuleDao.KEYWORDS_AND_ICONS) {
        let matches = [];

        let pattern = new RegExp(rule.Regex, 'i');

        for (let text of [card.Rules, card.Special]) {
            let match = pattern.exec(text);

            if (match) matches.push(match);
        }

        for (let match of matches) {
            let ruleEntry = {
                title: rule.Title,
                description: rule.Description
            };

            for (let replacement of ["quantity", "start", "type"]) ruleEntry.description = ruleEntry.description.replaceAll(`{${replacement}}`, match.groups ? match.groups[replacement] : '');

            if (!rules.some(x => x.title === ruleEntry.title && x.description === ruleEntry.description)) rules.push(ruleEntry);
        }
    }

    return rules.length > 0 ? [...new Set(rules)] : null;
}

const FindUniqueArts = exports.FindUniqueArts = function(card) {
    return card.Printings.filter(x => x.UniqueArt).map(x => x.ArtificialId);
}

const GetBaseId = exports.GetBaseId = function(card) {
    let threshold = card.Official ? ID_LENGTH : ID_LENGTH + card.AuthorId.length + 1;

    return card.Id.substring(0, threshold);
}

const GetPrintingByArtificialId = exports.GetPrintingByArtificialId = function(card, artificialId) {
    return card.Printings.find(x => x.ArtificialId === artificialId);
}

exports.ShareFaces = function(thisCard, thatCard) {
    return thisCard.Id != thatCard.Id && GetBaseId(thisCard) === GetBaseId(thatCard);
}

exports.ShareGroups = function(thisCard, thatCard) {
    return thisCard.GroupId && thatCard.GroupId && thisCard.GroupId == thatCard.GroupId;
}

const Imbibe = exports.Imbibe = function(interaction, card, currentArtStyle, currentFace, currentElement, collection, rulesToggle, artToggle, message = null) {
    let navigationRow = new MessageActionRow();
    let toggleRow = new MessageActionRow();

    let artStyles = FindUniqueArts(card);

    if (collection.elements.length > 0) {
        let style = collection.tag === 'Card' ? 'SECONDARY' : 'PRIMARY';

        navigationRow.addComponents(new MessageButton()
            .setCustomId('previousElement')
            .setLabel(`Previous ${collection.tag}`)
            .setStyle(style));
        
        navigationRow.addComponents(new MessageButton()
            .setCustomId('nextElement')
            .setLabel(`Next  ${collection.tag}`)
            .setStyle(style));
    }

    if (collection.faces.length > 0)
        navigationRow.addComponents(new MessageButton()
            .setCustomId('cycleFace')
            .setLabel('Flip Card')
            .setStyle('PRIMARY'));

    if (artStyles.length > 1)
        navigationRow.addComponents(new MessageButton()
            .setCustomId('cycleArt')
            .setLabel('Change Art')
            .setStyle('PRIMARY'));

    if (EvaluateRules(card))
        toggleRow.addComponents(new MessageButton()
            .setCustomId('toggleRules')
            .setLabel('Toggle Rules')
            .setStyle('SECONDARY'));

    toggleRow.addComponents(new MessageButton()
        .setCustomId('toggleArt')
        .setLabel('Toggle Art')
        .setStyle('SUCCESS'));

    toggleRow.addComponents(new MessageButton()
        .setCustomId('clearComponents')
        .setLabel('Clear Buttons')
        .setStyle('DANGER'));

    let promise;

    let artificialId = artStyles[currentArtStyle];

    let components = [];
    let embeds = [];
    let files = [];
    
    for (let row of [navigationRow, toggleRow]) {
        if (row.components.length > 0) components.push(row);
    }

    if (!artToggle) {
        if (!rulesToggle) embeds.push(BuildEmbed(card, artificialId));
        else embeds.push(BuildRulesEmbed(card, artificialId));
    }
    else {
        let printing = GetPrintingByArtificialId(card, artificialId);
        let set = SetDao.SETS.find(x => x.Id === printing.SetId);

        files.push({
            attachment: BuildCardImagePath(card, artificialId),
            name: `${(card.Incomplete || set.Incomplete) ? 'SPOILER_' : ''}${artificialId}.png`,
            spoiler: card.Incomplete
        });
    }

    let messageOptions = {
        components: components,
        embeds: embeds,
        files: files
    };

    if (message) promise = message.edit(messageOptions);
    else promise = SendMessageWithOptions(interaction, messageOptions);
        
    promise.then((message) => {
        const collector = message.createMessageComponentCollector({ componentType: 'BUTTON', time: 15000 });

        collector.on('collect', i => {
            if (i.user.id === interaction.member.id) {
                if (i.customId != 'clearComponents') collector.stop('navigation');

                i.deferUpdate()
                .then(async () => {
                    let nextArtStyle = currentArtStyle;
                    let nextCard = card;
                    let nextFace = currentFace;
                    let nextElement = currentElement;
                    let nextCollection = collection;
                    let nextRulesToggle = rulesToggle;
                    let nextArtToggle = artToggle;

                    switch (i.customId) {
                        case 'cycleArt':
                            nextArtStyle = currentArtStyle + 1 >= artStyles.length ? 0 : currentArtStyle + 1;

                            break;
                        case 'cycleFace':
                            nextArtStyle = 0;
                            nextFace = currentFace + 1 >= nextCollection.faces.length ? 0 : currentFace + 1;
                            nextCard = nextCollection.cards.find(x => x.Id === nextCollection.faces[nextFace]);
                            nextRulesToggle = false;
                            
                            if (nextCollection.elements) nextElement = nextCollection.elements.findIndex(x => x.cardId === nextCard.Id);

                            break;
                        case 'previousElement':
                            nextArtStyle = 0;
                            nextElement = currentElement - 1 >= 0 ? currentElement - 1 : nextCollection.elements.length - 1;
                            nextCard = nextCollection.cards.find(x => x.Id === nextCollection.elements[nextElement].cardId);
                            nextRulesToggle = false;
                            
                            if (nextCollection.elements[nextElement].faces) {
                                nextCollection.faces = nextCollection.elements[nextElement].faces;
                                nextFace = nextCollection.faces.findIndex(x => x === nextCard.Id);
                            }
                            else {
                                nextCollection.faces = [];
                                nextFace = -1;
                            }
                            
                            break;
                        case 'nextElement':
                            nextArtStyle = 0;
                            nextElement = currentElement + 1 >= nextCollection.elements.length ? 0 : currentElement + 1;
                            nextCard = nextCollection.cards.find(x => x.Id === nextCollection.elements[nextElement].cardId);
                            nextRulesToggle = false;
                            
                            if (nextCollection.elements[nextElement].faces) {
                                nextCollection.faces = nextCollection.elements[nextElement].faces;
                                nextFace = nextCollection.faces.findIndex(x => x === nextCard.Id);
                            }
                            else {
                                nextCollection.faces = [];
                                nextFace = -1;
                            }
                            
                            break;
                        case 'toggleRules':
                            nextRulesToggle = !rulesToggle;
                            nextArtToggle = false;

                            break;
                        case 'toggleArt':
                            nextRulesToggle = false;
                            nextArtToggle = !nextArtToggle;

                            break;
                        case 'clearComponents':
                            collector.stop('cancellation');
                            return;
                        default:
                            break;
                    }

                    Imbibe(interaction, nextCard, nextArtStyle, nextFace, nextElement, nextCollection, nextRulesToggle, nextArtToggle, message);
                });
            }
            else i.reply({embeds: [CreateEmbed(INTERACT_APOLOGY)], ephemeral: true});
        });

        collector.on('end', (i, reason) => {
            let content = null;
            let removeFiles = true;

            if (reason === 'navigation') content = LOAD_APOLOGY;
            else removeFiles = !artToggle;
            
            RemoveComponents(message, content, removeFiles);
        });
    });
}