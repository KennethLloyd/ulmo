'use strict'

const mysql             = require('anytv-node-mysql');
const config            = require(__dirname + '/config/config');
const promise           = require('promise');
const winston           = require('winston');
const async             = require("async");
const uuid              = require("uuid");

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

    module.save_current_inventory = (params) => {
        return new Promise(function(resolve, reject) {
            var inventory = [];
            var balance_id = uuid.v4();
            var current_location = null;

            mysql.use(db)
            .query(
                'INSERT INTO im_balance_history(id, label, user_id) VALUES (?,?,?);', 
                [balance_id, params.label, params.user_id],
                get_details
            )   

            function get_details(err, result) {
                if (!err) {
                    var retrieve_params = {
                        location_id: [],
                        item_id: [],
                        is_breakdown: 1,
                        is_grouped: 0,
                        page: -1,
                        user_id: params.user_id
                    }

                    module.get_current_inventory(retrieve_params)
                    .then(function(response) {
                        inventory = response;
                        async.each(inventory, prepare_save_details, send_response);
                    })
                    .catch(function(err) {           
                        winston.error('Error in getting current inventory', err);           
                        return next(err);
                    })
                }
                else {
                    console.log(err);
                    reject(err); 
                }
            }

            function prepare_save_details(row, callback) {
                function send_callback(err, result) {
                    if (err) {
                        winston.error('Error in saving current inventory details', last_query);
                        return callback(err);
                    }
                    return callback();
                }
                
                if (row.items.length) {
                    current_location = row.location_id;
                    async.each(row.items, save_details, send_callback)
                }
                else {
                    send_callback(null, null);
                }
            }

            function save_details(row, callback) {
                function send_callback(err, result) {
                    if (err) {
                        winston.error('Error in saving current inventory details', last_query);
                        return callback(err);
                    }
                    return callback();
                }
                
                mysql.use(db)
                .query(
                    'INSERT INTO im_balance_history_details(id, balance_id, location_id, item_id, expiration_date, quantity) VALUES (?,?,?,?,?,?)', 
                    [uuid.v4(), balance_id, current_location, row.item_id, row.expiration_date, row.item_quantity],
                    send_callback
                )
            }

            function send_response(err, result) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(inventory);
                }
            }
        })
    }

    module.get_current_inventory = (params) => {
        return new Promise(function(resolve, reject) {
            var response = [];
            var latest_balance = [];
            var pagination = null;

            if (typeof params.search_item === 'undefined' || params.search_item === undefined) {
                params.search_item = '';
            }
            if (typeof params.is_breakdown === 'undefined' || params.is_breakdown === undefined) {
                params.is_breakdown = 1;
            }
            if (typeof params.is_grouped === 'undefined' || params.is_grouped === undefined) {
                params.is_grouped = 1;
            }

            if (params.page === -1) {
                pagination = "";
            }
            else {
                pagination = "LIMIT " + params.page + ", " + params.limit; 
            }

            get_latest_balance_header();

            function get_latest_balance_header() {
                mysql.use(db)
                    .query(
                        'SELECT * FROM im_balance_history WHERE user_id = ? ORDER BY created DESC LIMIT 1',
                        [params.user_id],
                        function(err, res) {
                            if (err) {
                                console.log(err);
                                reject(err);
                            }
                            else if (!res.length) { //no previous balance
                                latest_balance = [];
                                start();
                            }
                            else {
                                get_latest_balance_details(res[0].id);
                            }
                        }
                    )
            }

            function get_latest_balance_details(balance_id) {
                mysql.use(db)
                .query(
                    'SELECT * FROM im_balance_history_details WHERE balance_id = ?',
                    [balance_id],
                    function(err, res) {
                        if (err) {
                            console.log(err);
                            reject(err);
                        }
                        else {
                            latest_balance = res;
                            start();
                        }
                    }
                )
            }

            function start() {
                if (params.is_breakdown == 1) { //default for specific locations
                    if (params.location_id.length === 0) {
                        mysql.use(db)
                        .query(
                            'SELECT l.id AS location_id, l.code AS location_code, l.name AS location_name, u.' + user_config.user_id + ' AS user_id,  u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name FROM im_location l, ' + user_config.user_table + ' u WHERE u.' + user_config.user_id + ' = ? AND l.user_id = ? AND l.deleted IS NULL AND u.deleted IS NULL',
                            [params.user_id, params.user_id],
                            function(err, res) {
                                if (err) {
                                    console.log(err);
                                    reject(err);
                                }
                                else {
                                    async.each(res, fetch_items_breakdown, send_response); //get items for each location
                                }
                            }
                        )
                    }
                    else {
                        mysql.use(db)
                        .query(
                            'SELECT l.id AS location_id, l.code AS location_code, l.name AS location_name, u.' + user_config.user_id + ' AS user_id,  u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name FROM im_location l, ' + user_config.user_table + ' u WHERE l.id IN (?) AND u.' + user_config.user_id + ' = ? AND l.deleted IS NULL AND u.deleted IS NULL',
                            [params.location_id, params.user_id],
                            function(err, res) {
                                if (err) {
                                    console.log(err);
                                    reject(err);
                                }
                                else {
                                    async.each(res, fetch_items_breakdown, send_response); //get items for each location
                                }
                            }
                        )
                    }
                }
                else { //location has been set to 'all'
                    mysql.use(db)
                    .query(
                        'SELECT u.' + user_config.user_id + ' AS user_id,  u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name FROM ' + user_config.user_table + ' u WHERE u.' + user_config.user_id + ' = ? AND u.deleted IS NULL',
                        [params.user_id],
                        function(err, res) {
                            if (err) {
                                console.log(err);
                                reject(err);
                            }
                            else {
                                async.each(res, fetch_items_no_breakdown, send_response); //get items for each location
                            }
                        }
                    )
                }
            }

            function fetch_items_breakdown(row, callback) {
                function send_callback(err, result) {
                    if (err) {
                        //winston.error('Error in retrieving current inventory', last_query);
                        console.log(err);
                        return callback(err);
                    }
                    row['items'] = result;
                    response.push(row);
                    return callback();
                }
                
                var deposited = [];
                var withdrawn = [];

                if (params.is_grouped == 1) {
                    var group_clause = "GROUP BY i." + item_config.item_id;
                    var exp_clause = "";
                }
                else {
                    var group_clause = "GROUP BY mv.item_id, mv.expiration_date";
                    var exp_clause = ", mv.expiration_date";
                }
                
                if (params.item_id.length === 0) { //all items
                    //STOCK = SUM(deposited) - SUM(withdrawn)
                    mysql.use(db)
                    .query(
                        'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity' + exp_clause + ' FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.location_id = ? AND mv.user_id = ? AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "DEPOSIT" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.deleted IS NULL ' + group_clause + ' ' + pagination, 
                        [row.location_id, row.user_id, "%"+params.search_item+"%", "%"+params.search_item+"%"],
                        function(err1, res1) {
                            if (!err1) {
                                deposited = res1;
                                mysql.use(db)
                                .query(
                                    'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity' + exp_clause + ' FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.location_id = ? AND mv.user_id = ? AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "WITHDRAW" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.deleted IS NULL ' + group_clause + ' ' + pagination, 
                                    [row.location_id, row.user_id, "%"+params.search_item+"%", "%"+params.search_item+"%"],
                                    function(err2, res2) {
                                        if (!err2) {
                                            withdrawn = res2;
                                            if (params.is_grouped == 1) {
                                                for (var i=0;i<deposited.length;i++) {
                                                    for (var j=0;j<withdrawn.length;j++) {
                                                        if (deposited[i].item_id == withdrawn[j].item_id) {
                                                            deposited[i].item_quantity = (deposited[i].item_quantity - withdrawn[j].item_quantity);
                                                            break;
                                                        }
                                                    }
                                                }
                                            }
                                            else {
                                                for (var i=0;i<deposited.length;i++) {
                                                    for (var j=0;j<withdrawn.length;j++) {
                                                        if ((deposited[i].item_id == withdrawn[j].item_id) && (deposited[i].expiration_date.toString() == withdrawn[j].expiration_date.toString())) {
                                                            deposited[i].item_quantity = (deposited[i].item_quantity - withdrawn[j].item_quantity);
                                                            break;
                                                        }
                                                    }
                                                }
                                            }
                                            send_callback(err2, deposited)
                                        }
                                        else {
                                            console.log(err2);
                                        }
                                    }
                                )
                            }
                            else {
                                console.log(err1);
                            }
                        }
                    )
                }
                else { //specific items
                    //STOCK = SUM(deposited) - SUM(withdrawn)
                    mysql.use(db)
                    .query(
                        'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity' + exp_clause + ' FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.location_id = ? AND mv.item_id IN (?) AND mv.user_id = ? AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "DEPOSIT" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.deleted IS NULL ' + group_clause + ' ' + pagination, 
                        [row.location_id, params.item_id, row.user_id, "%"+params.search_item+"%", "%"+params.search_item+"%"],
                        function(err1, res1) {
                            if (!err1) {
                                deposited = res1;
                                mysql.use(db)
                                .query(
                                    'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity' + exp_clause + ' FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.location_id = ? AND mv.item_id IN (?) AND mv.user_id = ? AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "WITHDRAW" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.deleted IS NULL ' + group_clause + ' ' + pagination, 
                                    [row.location_id, params.item_id, row.user_id, "%"+params.search_item+"%", "%"+params.search_item+"%"],
                                    function(err2, res2) {
                                        if (!err2) {
                                            withdrawn = res2;
                                            if (params.is_grouped == 1) {
                                                for (var i=0;i<deposited.length;i++) {
                                                    for (var j=0;j<withdrawn.length;j++) {
                                                        if (deposited[i].item_id == withdrawn[j].item_id) {
                                                            deposited[i].item_quantity = (deposited[i].item_quantity - withdrawn[j].item_quantity);
                                                            break;
                                                        }
                                                    }
                                                }
                                            }
                                            else {
                                                for (var i=0;i<deposited.length;i++) {
                                                    for (var j=0;j<withdrawn.length;j++) {
                                                        if ((deposited[i].item_id == withdrawn[j].item_id) && (deposited[i].expiration_date.toString() == withdrawn[j].expiration_date.toString())) {
                                                            deposited[i].item_quantity = (deposited[i].item_quantity - withdrawn[j].item_quantity);
                                                            break;
                                                        }
                                                    }
                                                }
                                            }
                                            send_callback(err2, deposited)
                                        }
                                        else {
                                            console.log(err2);
                                        }
                                    }
                                )
                            }
                            else {
                                console.log(err1);
                            }
                        }
                    )
                }
            }

            function fetch_items_no_breakdown(row, callback) {
                function send_callback(err, result, args, last_query) {
                    if (err) {
                        winston.error('Error in retrieving current inventory', last_query);
                        return callback(err);
                    }
                    row['items'] = result;
                    response.push(row);
                    return callback();
                }
                
                var deposited = [];
                var withdrawn = [];

                if (params.item_id.length === 0) { //all items
                    //STOCK = SUM(deposited) - SUM(withdrawn)
                    mysql.use(db)
                    .query(
                        'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.user_id = ? AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "DEPOSIT" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.deleted IS NULL GROUP BY i.' + item_config.item_id + ' ' + pagination, 
                        [row.user_id, "%"+params.search_item+"%", "%"+params.search_item+"%"],
                        function(err1, res1) {
                            if (!err1) {
                                deposited = res1;
                                mysql.use(db)
                                .query(
                                    'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.user_id = ? AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "WITHDRAW" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.deleted IS NULL GROUP BY i.' + item_config.item_id + ' ' + pagination,  
                                    [row.user_id, "%"+params.search_item+"%", "%"+params.search_item+"%"],
                                    function(err2, res2) {
                                        if (!err2) {
                                            withdrawn = res2;
                                            for (var i=0;i<deposited.length;i++) {
                                                for (var j=0;j<withdrawn.length;j++) {
                                                    if (deposited[i].item_id == withdrawn[j].item_id) {
                                                        deposited[i].item_quantity = (deposited[i].item_quantity - withdrawn[j].item_quantity);
                                                        break;
                                                    }
                                                }
                                            }
                                            send_callback(err2, deposited)
                                        }
                                        else {
                                            console.log(err2);
                                        }
                                    }
                                )
                            }
                            else {
                                console.log(err1);
                            }
                        }
                    )
                }
                else { //specific items only
                    //STOCK = SUM(deposited) - SUM(withdrawn)
                    mysql.use(db)
                    .query(
                        'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.item_id IN (?) AND mv.user_id = ? AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "DEPOSIT" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.deleted IS NULL GROUP BY i.' + item_config.item_id + ' ' + pagination, 
                        [params.item_id, row.user_id, "%"+params.search_item+"%", "%"+params.search_item+"%"],
                        function(err1, res1) {
                            if (!err1) {
                                deposited = res1;
                                mysql.use(db)
                                .query(
                                    'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.item_id IN (?) AND mv.user_id = ? AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "WITHDRAW" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.deleted IS NULL GROUP BY i.' + item_config.item_id + ' ' + pagination,  
                                    [params.item_id, row.user_id, "%"+params.search_item+"%", "%"+params.search_item+"%"],
                                    function(err2, res2) {
                                        if (!err2) {
                                            withdrawn = res2;
                                            for (var i=0;i<deposited.length;i++) {
                                                for (var j=0;j<withdrawn.length;j++) {
                                                    if (deposited[i].item_id == withdrawn[j].item_id) {
                                                        deposited[i].item_quantity = (deposited[i].item_quantity - withdrawn[j].item_quantity);
                                                        break;
                                                    }
                                                }
                                            }
                                            send_callback(err2, deposited)
                                        }
                                        else {
                                            console.log(err2);
                                        }
                                    }
                                )
                            }
                            else {
                                console.log(err1);
                            }
                        }
                    )
                }
            }

            function send_response(err, result) {
                if (err) {
                    reject(err);
                }
                else {
                    //return the result
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
