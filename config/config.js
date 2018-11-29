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

    JEEVES_DB: {
        host: 'localhost',
	    user: 'root',
        //password: 'pr0j3ct0r',
        password: '',
        database: 'sme_db'
    },

    jeeves_db_item_config: {
        item_table: 'material',
        item_id: 'id',
        item_sku: 'code',
        item_name: 'name'
    },

    jeeves_db_user_config: {
        user_table: 'users',
        user_id: 'id',
        user_first_name: 'first_name',
        user_last_name: 'last_name'
    },

    bgw73vdwex88xb6h_DB: {
        host: 'd6vscs19jtah8iwb.cbetxkdyhwsb.us-east-1.rds.amazonaws.com',
        user: 'ykoqwv2n78hpimu0',
        password: 'twa8j54kcuepm337',
        database: 'bgw73vdwex88xb6h'
    },

    bgw73vdwex88xb6h_db_item_config: {
        item_table: 'material',
        item_id: 'id',
        item_sku: 'code',
        item_name: 'name'
    },

    bgw73vdwex88xb6h_db_user_config: {
        user_table: 'users',
        user_id: 'id',
        user_first_name: 'first_name',
        user_last_name: 'last_name'
    }
    
};