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
	    password: 'pr0j3ct0r',
        database: 'sme_db'

    }
    
};