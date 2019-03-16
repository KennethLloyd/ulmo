'use strict';

module.exports = {
    ENV: 'development',

    CORS: {
        allowed_headers: 'Content-Type, Accept, x-access-token',
        allowed_origins_list: [
            'cdi.loc',
            'localhost'

        ],
        allowed_methods: 'GET, POST, PUT, DELETE',
        allow_credentials: true
    },

    MAGENTO_DB: {
        host: '192.168.1.10',
        port: '3310',
        user: 'magento',
        password: 'magento123',
        database: 'magento'
    },
    magento_item_config: {
        item_table: 'catalog_product_entity',
        item_id: 'entity_id',
        item_sku: 'sku',
        item_name: 'sku'
    },
    magento_user_config: {
        user_table: 'admin_user',
        user_id: 'user_id',
        user_first_name: 'firstname',
        user_last_name: 'lastname'
    },
    GALADRIEL_DB: {
        host: '127.0.0.1',
        port: '3306',
        user: 'galadriel',
        password: 'l0rdc3l3br0n',
        database: 'galadriel'
    },
    galadriel_item_config: {
        item_table: 'catalog_product_entity',
        item_id: 'entity_id',
        item_sku: 'sku',
        item_name: 'sku'
    },
    galadriel_user_config: {
        user_table: 'admin_user',
        user_id: 'user_id',
        user_first_name: 'firstname',
        user_last_name: 'lastname'
    },
    GALADRIEL_MOCK_DB: {
        host: '127.0.0.1',
        port: '3306',
        user: 'galadriel',
        password: 'l0rdc3l3br0n',
        database: 'galadriel_mock'
    },
    galadriel_mock_item_config: {
        item_table: 'catalog_product_entity',
        item_id: 'entity_id',
        item_sku: 'sku',
        item_name: 'sku'
    },
    galadriel_mock_user_config: {
        user_table: 'admin_user',
        user_id: 'user_id',
        user_first_name: 'firstname',
        user_last_name: 'lastname'
    },
};