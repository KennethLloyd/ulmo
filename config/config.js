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
	    user: 'jeeves',
	    password: 'pwd@jeeves33',
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
    }
    
};