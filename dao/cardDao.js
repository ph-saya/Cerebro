const { CardEntity } = require('../models/cardEntity');
const { GetBaseId, ShareFaces, ShareGroups } = require('../utilities/cardHelper');
const { CreateDocumentStore, DeriveDatabase } = require('../utilities/documentStoreHelper');
const { OFFICIAL, UNOFFICIAL, BY_NAME } = require('../constants');

const TrimDuplicates = function(cards) {
    let results = [];

    for (let card of cards) {
        if (!results.some(x => ShareFaces(card, x) || ShareGroups(card, x))) {
            results.push(card);
        }
    }

    return results;
}

class CardDao {
    constructor() {}

    static store = CreateDocumentStore(DeriveDatabase(CardEntity.DATABASE_SUFFIX)).initialize();

    static async FindFaces(card) {
        let baseId = GetBaseId(card);

        if (card.Id.length === baseId.length) return null;

        let index = `${card.Official ? OFFICIAL : UNOFFICIAL}${CardEntity.COLLECTION}`;

        let results = [];

        let documents = await this.store.openSession().query({ indexName: index })
            .whereRegex('id()', baseId)
            .orderBy('id()').all();

        for (let document of documents) {
            results.push(new CardEntity(document));
        }

        return results.length > 1 ? results : null;
    }

    static async FindStages(card) {
        if (!card.GroupId) return null;

        let index = `${card.Official ? OFFICIAL : UNOFFICIAL}${CardEntity.COLLECTION}`;

        let results = [];

        let documents = await this.store.openSession().query({ indexName: index })
            .whereRegex('GroupId', card.GroupId)
            .orderBy('id()').all();

        for (let document of documents) {
            results.push(new CardEntity(document));
        }

        return results.length > 1 ? results : null;
    }

    static async FindFacesAndStages(card) {
        let collection = {
            cards: [],
            faces: [],
            stages: []
        }

        if (card.Type === 'Villain' || card.Type === 'Main Scheme') {
            let stages = await this.FindStages(card);
            
            if (stages) {
                for (let stage of stages) {
                    collection.cards.push(stage);

                    let stageEntry = {
                        cardId: stage.Id,
                        faces: null
                    };

                    let baseId = GetBaseId(stage);

                    if (stage.Id.length != baseId.length) stageEntry.faces = stages.filter(x => x.Id.includes(baseId)).map(x => x.Id);

                    collection.stages.push(stageEntry);
                }
                
                let currentStage = collection.stages.find(x => x.cardId === card.Id);

                if (currentStage.faces) collection.faces = currentStage.faces;

                return collection;
            }
            else {
                let faces = await this.FindFaces(card);

                if (faces) {
                    for (let face of faces) {
                        collection.cards.push(face);
                        collection.faces.push(face.Id);
                    }

                    return collection;
                }
            }
        }
        else {
            let faces = await this.FindFaces(card);

            if (faces) {
                for (let face of faces) {
                    collection.cards.push(face);
                    collection.faces.push(face.Id);
                }

                return collection;
            }
        }

        collection.cards.push(card);
        
        return collection;
    }

    static async RetrieveByName(terms, official) {        
        const session = this.store.openSession();

        terms = terms.toLowerCase();

        let index = `${official ? OFFICIAL : UNOFFICIAL}${CardEntity.COLLECTION}`;
        let convertedQuery = terms.normalize('NFD').replace(/[\u0300-\u036f]/gmi, '').toLowerCase();
        let tokenizedQuery = convertedQuery.replace(/[^a-z0-9 -]/gmi, '').replace(/[-]/gmi, ' ');
        let strippedQuery = convertedQuery.replace(/[^a-z0-9]/gmi, '');

        let documents = await session.query({ indexName: index })
            .search('id()', convertedQuery, 'AND').orElse()
            .search('Name', convertedQuery, 'AND').orElse()
            .search('TokenizedName', tokenizedQuery, 'AND').orElse()
            .search('StrippedName', strippedQuery, 'AND').orElse()
            .search('Subname', convertedQuery, 'AND').orElse()
            .search('TokenizedSubname', tokenizedQuery, 'AND').orElse()
            .search('StrippedSubname', strippedQuery, 'AND')
            .all();
        
        if (documents.length === 0) {
            convertedQuery = convertedQuery.replace(/[ ]/gmi, '');

            documents = await session.query({ indexName: index })
                .whereRegex('id()', convertedQuery).orElse()
                .whereRegex('Name', convertedQuery).orElse()
                .whereRegex('TokenizedName', tokenizedQuery).orElse()
                .whereRegex('StrippedName', strippedQuery).orElse()
                .whereRegex('Subname', convertedQuery).orElse()
                .whereRegex('TokenizedSubname', tokenizedQuery).orElse()
                .whereRegex('StrippedSubname', strippedQuery)
                .all();

                if (documents.length === 0) {
                    documents = await session.query({ indexName: index })
                        .whereEquals('Name', convertedQuery).fuzzy(0.70).orElse()
                        .whereEquals('TokenizedName', tokenizedQuery).fuzzy(0.70).orElse()
                        .whereEquals('StrippedName', strippedQuery).fuzzy(0.70).orElse()
                        .whereEquals('Subname', convertedQuery).fuzzy(0.70).orElse()
                        .whereEquals('TokenizedSubname', tokenizedQuery).fuzzy(0.70).orElse()
                        .whereEquals('StrippedSubname', strippedQuery).fuzzy(0.70)
                        .all();
                }
        }

        if (documents.length > 0) {
            let results = [];

            for (let document of documents) {
                results.push(new CardEntity(document));
            }

            let matches = results.filter(function(card) {
                return card.Name.toLowerCase() === terms || (card.Subname != null && card.Subname.toLowerCase() === terms) || card.Id.toLowerCase() === terms;
            });

            return TrimDuplicates(matches.length > 0 ? matches : results);
        }
    }
}

module.exports = { CardDao }