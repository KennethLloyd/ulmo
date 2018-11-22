'use strict'

const mysql             = require('anytv-node-mysql');
const config            = require(__dirname + '/config/config');
const promise           = require('promise');
const winston           = require('winston');
const async             = require("async");

mysql.add('jeeves_db', config.JEEVES_DB);

module.exports = function(db_name) {
    var module = {};
    var db = db_name;
    var item_config = config[db_name + "_item_config"];
    var user_config = config[db_name + "_user_config"];
    
    module.run_sample = () => {
        return new Promise(function(resolve, reject) {
            mysql.use(db)
            .query(
                'SELECT * FROM ' + item_config.item_table + ' WHERE ' + item_config.item_id + ' = ?;',
                [1],
                function(err1, res1) {
                    if (err1) {
                        reject(err1);
                    }

                    else {
                        resolve(res1);
                    }
                }
            )
            .end();
        })
    };

    module.get_current_inventory = (location_id, item_id, search_item, is_saved, is_breakdown, page, limit, label, user_id) => {
        return new Promise(function(resolve, reject) {
            const location_ids = location_id;
            const item_ids = item_id;
            var response = [];
            async.each(location_ids, fetch_items, send_response); //get items for each location

            function fetch_items(row, callback) {
                function send_callback(err, result, args, last_query) {
                    if (err) {
                        winston.error('Error in retrieving current inventory', last_query);
                        return callback(err);
                    }
                    response.push(result);
                    return callback();
                }
                
                //TODO add qty of same sku but different expiration dates
                mysql.use(db)
                    .query(
                        'SELECT mv.id, mv.location_id, l.code AS location_code, l.name AS location_name, mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, mv.quantity, mv.expiration_date, mv.created, mv.updated, mv.deleted, mv.user_id, u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name FROM im_item_movement mv, ' + item_config.item_table + ' i, im_location l, ' + user_config.user_table + ' u WHERE mv.location_id = ? AND mv.item_id IN (?) AND mv.user_id = ? AND mv.item_id = i.' + item_config.item_id + ' AND mv.location_id = l.id AND mv.user_id = u.' + user_config.user_id + ' AND mv.type = "DEPOSIT" AND mv.deleted IS NULL',
                        [row, item_ids, user_id],
                        send_callback
                    )
            }

            function send_response(err, result, args, last_query) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(response);
                }
            }
        })
    }

    module.sample_method = () => {

    }

    module.sample_method2 = () => {
        
    }

    return module;
};
