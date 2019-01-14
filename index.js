'use strict'

const mysql             = require('anytv-node-mysql');
const config            = require(__dirname + '/config/config');
const promise           = require('promise');
const winston           = require('winston');
const async             = require("async");
const uuid              = require("uuid");

mysql.add('magento', config.MAGENTO_DB);

module.exports = function(db_name) {
    var module = {};
    var db = db_name;
    var item_config = config[db_name + "_item_config"];
    var user_config = config[db_name + "_user_config"];

    module.get_current_inventory = (params) => {
        return new Promise(function(resolve, reject) {
            var response = [];
            var latest_balance = [];
            var pagination = null;
            var balance_date = null;

            let inventory = {};

            if (typeof params.search_item === 'undefined' || params.search_item === undefined) {
                params.search_item = '';
            }
            if (typeof params.is_breakdown === 'undefined' || params.is_breakdown === undefined) {
                params.is_breakdown = 1;
            }
            if (typeof params.is_grouped === 'undefined' || params.is_grouped === undefined) {
                params.is_grouped = 1;
            }

            pagination = "";
            

            start();

            function start() {
                if (params.is_breakdown == 1) { //default for specific locations
                    if (params.location_id.length === 0) {
                        mysql.use(db)
                        .query(
                            'SELECT l.id AS location_id, l.code AS location_code, l.name AS location_name FROM im_location l WHERE l.deleted IS NULL ORDER BY l.name',
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
                            'SELECT l.id AS location_id, l.code AS location_code, l.name AS location_name FROM im_location l WHERE l.id IN (?) AND l.deleted IS NULL ORDER BY l.name',
                            [params.location_id],
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
                else {
                    async.each([], fetch_items_no_breakdown, send_response);
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
                        'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity' + exp_clause + ' FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.location_id = ? AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "DEPOSIT" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.deleted IS NULL ' + group_clause + ' ORDER BY i.' + item_config.item_name + ' ' + pagination,
                        [row.location_id, "%"+params.search_item+"%", "%"+params.search_item+"%"],
                        function(err1, res1) {
                            if (!err1) {
                                deposited = res1;
                                mysql.use(db)
                                .query(
                                    'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity' + exp_clause + ' FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.location_id = ? AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "WITHDRAW" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.deleted IS NULL ' + group_clause + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                                    [row.location_id, "%"+params.search_item+"%", "%"+params.search_item+"%"],
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
                                                        if ((deposited[i].item_id == withdrawn[j].item_id) && (deposited[i].expiration_date !== null && withdrawn[j]._expiration_date !== null)) {
                                                            if (format_date(deposited[i].expiration_date) == format_date(withdrawn[j].expiration_date)) {
                                                                deposited[i].item_quantity = (deposited[i].item_quantity - withdrawn[j].item_quantity);
                                                                break;
                                                            }
                                                        }
                                                        else if ((deposited[i].item_id == withdrawn[j].item_id) && (deposited[i].expiration_date == null && withdrawn[j]._expiration_date == null)) {
                                                            if (deposited[i].expiration_date == withdrawn[j].expiration_date) {
                                                                deposited[i].item_quantity = (deposited[i].item_quantity - withdrawn[j].item_quantity);
                                                                break;
                                                            }
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
                        'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity' + exp_clause + ' FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.location_id = ? AND mv.item_id IN (?) AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "DEPOSIT" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.deleted IS NULL ' + group_clause + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                        [row.location_id, params.item_id, "%"+params.search_item+"%", "%"+params.search_item+"%"],
                        function(err1, res1) {
                            if (!err1) {
                                deposited = res1;
                                mysql.use(db)
                                .query(
                                    'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity' + exp_clause + ' FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.location_id = ? AND mv.item_id IN (?) AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "WITHDRAW" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.deleted IS NULL ' + group_clause + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                                    [row.location_id, params.item_id, "%"+params.search_item+"%", "%"+params.search_item+"%"],
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
                                                        if ((deposited[i].item_id == withdrawn[j].item_id) && (deposited[i].expiration_date !== null && withdrawn[j]._expiration_date !== null)) {
                                                            if (format_date(deposited[i].expiration_date) == format_date(withdrawn[j].expiration_date)) {
                                                                deposited[i].item_quantity = (deposited[i].item_quantity - withdrawn[j].item_quantity);
                                                                break;
                                                            }
                                                        }
                                                        else if ((deposited[i].item_id == withdrawn[j].item_id) && (deposited[i].expiration_date == null && withdrawn[j]._expiration_date == null)) {
                                                            if (deposited[i].expiration_date == withdrawn[j].expiration_date) {
                                                                deposited[i].item_quantity = (deposited[i].item_quantity - withdrawn[j].item_quantity);
                                                                break;
                                                            }
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
                        console.log(err);
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
                        'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.item_id = i.' + item_config.item_id + ' AND mv.type = "DEPOSIT" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.deleted IS NULL GROUP BY i.' + item_config.item_id + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                        ["%"+params.search_item+"%", "%"+params.search_item+"%"],
                        function(err1, res1) {
                            if (!err1) {
                                deposited = res1;
                                mysql.use(db)
                                .query(
                                    'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.item_id = i.' + item_config.item_id + ' AND mv.type = "WITHDRAW" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.deleted IS NULL GROUP BY i.' + item_config.item_id + ' ORDER BY i.' + item_config.item_name + ' ' + pagination,  
                                    ["%"+params.search_item+"%", "%"+params.search_item+"%"],
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
                        'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.item_id IN (?) AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "DEPOSIT" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.deleted IS NULL GROUP BY i.' + item_config.item_id + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                        [params.item_id, "%"+params.search_item+"%", "%"+params.search_item+"%"],
                        function(err1, res1) {
                            if (!err1) {
                                deposited = res1;
                                mysql.use(db)
                                .query(
                                    'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.item_id IN (?) AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "WITHDRAW" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.deleted IS NULL GROUP BY i.' + item_config.item_id + ' ORDER BY i.' + item_config.item_name + ' ' + pagination,  
                                    [params.item_id, "%"+params.search_item+"%", "%"+params.search_item+"%"],
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
                    inventory.total = response.length;
                    if (params.page != -1) {
                        response = paginate(response, params.limit, params.page);
                    }
                    inventory.items = response;
                    resolve(inventory);
                }
            }

            function format_date(date) {
                if (date != null) {
                    var dates = new Date(date);
                    var year = dates.getFullYear();
                    var month = dates.getMonth()+1;
                    var dt = dates.getDate();
        
                    if (dt < 10) {
                        dt = '0' + dt;
                    }
                    if (month < 10) {
                        month = '0' + month;
                    }
        
                    var hrs = dates.getHours();
                    var mins = dates.getMinutes();
                    var secs = dates.getSeconds();
        
                    if (hrs < 10) {
                        hrs = '0' + hrs;
                    }
                    if (mins < 10) {
                        mins = '0' + mins;
                    }
                    if (secs < 10) {
                        secs = '0' + secs;
                    }
        
                    var date_formatted = year + '-' + month + '-' + dt + " " + hrs + ":" + mins + ":" + secs;
        
                    return date_formatted;
                }
                else {
                    return null;
                }
            }

            function paginate (array, page_size, page_number) {
                --page_number; // because pages logically start with 1, but technically with 0
                return array.slice(page_number * page_size, (page_number + 1) * page_size);
              }
        })
    }

    module.save_current_inventory = (params) => {
        return new Promise(function(resolve, reject) {
            var inventory = [];
            var balance_id = uuid.v4();
            var current_location = null;
            
            start();

            function start() {
                var retrieve_params = {
                    location_id: [],
                    item_id: [],
                    is_breakdown: 1,
                    is_grouped: 0,
                    page: -1, //to remove pagination in get_current_inventory
                }

                module.get_current_inventory(retrieve_params)
                .then(function(response) {
                    inventory = response.items;
                    mysql.use(db)
                    .query(
                        'INSERT INTO im_balance_history(id, label, user_id) VALUES (?,?,?);', 
                        [balance_id, params.label, params.user_id],
                        function(err1, res1) {
                            if (err1) {
                                console.log(err1);
                                reject(err1);
                            }
                            else {
                                resolve(async.each(inventory, prepare_save_details, send_response));
                            }
                        }
                    )  
                })
                .catch(function(err) {           
                    console.log(err);
                    reject(err);
                })
            }

            function prepare_save_details(row, callback) {
                function send_callback(err, result) {
                    if (err) {
                        console.log(err);
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
                        console.log(err);
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

    module.get_balance_history = (params) => {
        return new Promise(function(resolve, reject) {
            let balance = {};

            function format_date(date) {
                if (date != null) {
                    var dates = new Date(date);
                    var year = dates.getFullYear();
                    var month = dates.getMonth()+1;
                    var dt = dates.getDate();
        
                    if (dt < 10) {
                        dt = '0' + dt;
                    }
                    if (month < 10) {
                        month = '0' + month;
                    }
        
                    var hrs = dates.getHours();
                    var mins = dates.getMinutes();
                    var secs = dates.getSeconds();
        
                    if (hrs < 10) {
                        hrs = '0' + hrs;
                    }
                    if (mins < 10) {
                        mins = '0' + mins;
                    }
                    if (secs < 10) {
                            }
        
                    var date_formatted = year + '-' + month + '-' + dt + " " + hrs + ":" + mins + ":" + secs;
        
                    return date_formatted;
                }
                else {
                    return null;
                }
            }

            if (typeof params.search === 'undefined' || params.search === undefined) {
                params.search = '';
            }

            params.from_date = format_date(params.from_date);
            params.to_date = format_date(params.to_date);

            if (params.from_date !== null && params.to_date !== null) {
                mysql.use(db)
                .query(
                    'SELECT bh.id, bh.label, bh.created, bh.updated, bh.deleted, bh.user_id, u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name, (SELECT COUNT(*) FROM im_balance_history bh WHERE bh.label LIKE ? AND (bh.created BETWEEN ? AND ?)) AS total FROM im_balance_history bh, ' + user_config.user_table + ' u WHERE u.' + user_config.user_id + ' = bh.user_id AND bh.label LIKE ? AND (bh.created BETWEEN ? AND ?) LIMIT ?,?',
                    ["%"+params.search+"%", params.from_date, params.to_date, "%"+params.search+"%", params.from_date, params.to_date, params.page, params.limit],
                    send_response
                )
                .end();
            }
            else {
                mysql.use(db)
                .query(
                    'SELECT bh.id, bh.label, bh.created, bh.updated, bh.deleted, bh.user_id, u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name, (SELECT COUNT(*) FROM im_balance_history bh WHERE bh.label LIKE ?) AS total FROM im_balance_history bh, ' + user_config.user_table + ' u WHERE u.' + user_config.user_id + ' = bh.user_id AND bh.label LIKE ? LIMIT ?,?',
                    ["%"+params.search+"%", "%"+params.search+"%", params.page, params.limit],
                    send_response
                )
                .end();
            }

            function send_response(err, result) {
                if (err) {
                    reject(err);
                }
                else {
                    if (result.length) {
                        balance.total = result[0].total;
                        for (var i=0;i<result.length;i++) {
                            delete result[i].total;
                        }
                    }
                    else {
                        balance.total = 0;
                    }
                    balance.items = result;
                    resolve(balance);
                }
            }
        }) 
    }

    module.get_inventory = (params) => {
        return new Promise(function(resolve, reject) {
            var response = [];
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

            if (params.is_breakdown == 1) { //default for specific locations
                if (params.location_id.length === 0) { //get for all locations
                    mysql.use(db)
                    .query(
                        'SELECT bh.id AS balance_id, bh.label, l.id AS location_id, l.code AS location_code, l.name AS location_name, u.' + user_config.user_id + ' AS user_id,  u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name, bh.created FROM im_balance_history bh, im_location l, ' + user_config.user_table + ' u WHERE l.id IN (SELECT DISTINCT location_id FROM im_balance_history_details WHERE balance_id = ?) AND u.' + user_config.user_id + ' = bh.user_id AND bh.id = ?',
                        [params.balance_id, params.balance_id],
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
                else { //only retrieve those in specific locations
                    mysql.use(db)
                    .query(
                        'SELECT bh.id AS balance_id, bh.label, l.id AS location_id, l.code AS location_code, l.name AS location_name, u.' + user_config.user_id + ' AS user_id,  u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name, bh.created FROM im_balance_history bh, im_location l, ' + user_config.user_table + ' u WHERE l.id IN (SELECT DISTINCT location_id FROM im_balance_history_details WHERE balance_id = ?) AND l.id IN (?) AND u.' + user_config.user_id + ' = bh.user_id AND bh.id = ?',
                        [params.balance_id, params.location_id, params.balance_id],
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
            else { //location filter has been set to 'all' (is_breakdown = 0)
                mysql.use(db)
                .query(
                    'SELECT bh.id AS balance_id, bh.label, u.' + user_config.user_id + ' AS user_id,  u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name FROM im_balance_history bh, ' + user_config.user_table + ' u WHERE u.' + user_config.user_id + ' = bh.user_id AND bh.id = ?',
                    [params.balance_id],
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

            function fetch_items_breakdown(row, callback) {
                function send_callback(err, result) {
                    if (err) {
                        console.log(err);
                        return callback(err);
                    }
                    row['items'] = result;
                    response.push(row);
                    return callback();
                }

                if (params.is_grouped == 1) {
                    var group_clause = "GROUP BY i." + item_config.item_id;
                    var exp_clause = "";
                }
                else {
                    var group_clause = "GROUP BY hd.item_id, hd.expiration_date";
                    var exp_clause = ", hd.expiration_date";
                }
                
                if (params.item_id.length === 0) { //all items (not locations)
                    mysql.use(db)
                    .query(
                        'SELECT hd.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(hd.quantity) AS item_quantity' + exp_clause + ' FROM im_balance_history_details hd, ' + item_config.item_table + ' i WHERE hd.location_id = ? AND hd.item_id = i.' + item_config.item_id + ' AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND hd.balance_id = ? ' + group_clause + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                        [row.location_id, "%"+params.search_item+"%", "%"+params.search_item+"%", params.balance_id],
                        send_callback
                    )
                }
                else { //specific items
                    mysql.use(db)
                    .query(
                        'SELECT hd.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(hd.quantity) AS item_quantity' + exp_clause + ' FROM im_balance_history_details hd, ' + item_config.item_table + ' i WHERE hd.location_id = ? AND hd.item_id IN (?) AND hd.item_id = i.' + item_config.item_id + ' AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND hd.balance_id = ? ' + group_clause + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                        [row.location_id, params.item_id, "%"+params.search_item+"%", "%"+params.search_item+"%", params.balance_id],
                        send_callback
                    )
                }
            }

            function fetch_items_no_breakdown(row, callback) {
                function send_callback(err, result) {
                    if (err) {
                        console.log(err);
                        return callback(err);
                    }
                    row['items'] = result;
                    response.push(row);
                    return callback();
                }
                
                if (params.item_id.length === 0) { //all items (not locations)
                    mysql.use(db)
                    .query(
                        'SELECT hd.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(hd.quantity) AS item_quantity FROM im_balance_history_details hd, ' + item_config.item_table + ' i WHERE hd.item_id = i.' + item_config.item_id + ' AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND hd.balance_id = ? GROUP BY i.' + item_config.item_id + ' ORDER BY i.' + item_config.item_name + ' ' + pagination,
                        ["%"+params.search_item+"%", "%"+params.search_item+"%", params.balance_id],
                        send_callback
                    )
                }
                else { //specific items
                    mysql.use(db)
                    .query(
                        'SELECT hd.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(hd.quantity) AS item_quantity FROM im_balance_history_details hd, ' + item_config.item_table + ' i WHERE hd.item_id IN (?) AND hd.item_id = i.' + item_config.item_id + ' AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND hd.balance_id = ? GROUP BY i.' + item_config.item_id + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                        [params.item_id, "%"+params.search_item+"%", "%"+params.search_item+"%", params.balance_id],
                        send_callback
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

    module.get_expiration_date = (params) => {
        return new Promise(function(resolve, reject) {
            mysql.use(db)
            .query(
                'SELECT * FROM im_location WHERE id = ? AND deleted IS NULL', 
                [params.location_id],
                function(err1, res1) {
                    if (err1) {
                        console.log("Error in verifying location in get_expiration_date");
                        reject(new Error("Error in verifying location"));
                    } 
                    else if (!res1.length) {
                        console.log("Location not found in get_expiration_date");
                        reject(new Error("Location not found"));
                    }
                    else {
                        start();
                    }
                }
            )

            function start() {
                var retrieve_params = {
                    location_id: [params.location_id],
                    item_id: [params.item_id],
                    is_breakdown: 1,
                    is_grouped: 0,
                    page: -1, //to remove pagination in get_current_inventory
                }
    
                module.get_current_inventory(retrieve_params)
                .then(function(response) {
                    send_response(response.items);
                })
                .catch(function(err) {           
                    console.log('Error in getting current inventory inside get expiration date');     
                    reject(err);
                })
            }

            function send_response(inventory) {
                var expiration_dates_with_qty = [];
                var items = inventory[0].items;
                if (!items.length) {
                    console.log("Item not found in specified location in get expiration date");
                    reject(new Error("Item not found in specified location"));
                }
                else {
                    for (var i=0;i<items.length;i++) {
                        var exp_obj = {};
                        exp_obj.expiration_date = items[i].expiration_date;
                        exp_obj.max_quantity = items[i].item_quantity;
                        expiration_dates_with_qty.push(exp_obj);
                    }
                    resolve(expiration_dates_with_qty);
                }
            }
        })
    }

    module.init_cyclecount = (params) => {
        return new Promise(function(resolve, reject) {
            var report_id = uuid.v4();
            
            mysql.use(db)
            .query(
                'SELECT * FROM im_location WHERE id = ? AND deleted IS NULL', 
                [params.location_id],
                function(err1, res1) {
                    if (err1) {
                        console.log("Error in verifying location in init cyclecount");
                        reject(new Error("Error in verifying location"));
                    } 
                    else if (!res1.length) {
                        console.log("Location not found in init cyclecount");
                        reject(new Error("Location not found"));
                    }
                    else {
                        start();
                    }
                }
            )

            function start() {
                mysql.use(db)
                .query(
                    'INSERT INTO im_cycle_count(id, location_id, cycle_label, max_cycle, user_id) VALUES (?,?,?,?,?)', 
                    [report_id, params.location_id, params.cycle_label, params.max_cycle, params.user_id],
                    function(err1, res1) {
                        if (err1) {
                            console.log("Error in creating new cyclecount report")
                            reject(new Error("Error in creating new cycle count report"));
                        }
                        else {
                            async.each(params.items, create_details, send_response);
                        }
                    }
                )
            }

            function create_details(row, callback) {
                function send_callback(err, result) {
                    if (err) {
                        console.log('Error in creating new cyclecount report details');
                        return callback(err);
                    }
                    return callback();
                }
                
                mysql.use(db)
                .query(
                    'INSERT INTO im_cycle_count_details(id, cycle_count_id, item_id, actual_quantity) VALUES (?,?,?,?)', 
                    [uuid.v4(), report_id, row.item_id, row.item_quantity],
                    send_callback
                )
            }

            function send_response(err, res) {
                if (err) {
                    console.log("Error in initializing cycle count");
                    reject("Error in initializing cycle count");
                }
                else {
                    params.report_id = report_id;
                    resolve(params);
                }
            }
        })
    }

    module.get_pending_cyclecount = (params) => {
        return new Promise(function(resolve, reject) {      

            if (typeof params.search === 'undefined' || params.search === undefined) {
                params.search = '';
            }

            mysql.use(db)
            .query(
                'SELECT cc.id, cc.created AS date, cc.cycle_label, cc.location_id, l.code AS location_code, l.name AS location_name, cc.user_id, u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name, cc.round, cc.max_cycle FROM im_cycle_count cc, im_location l, ' + user_config.user_table + ' u WHERE cc.location_id = l.id AND cc.user_id = u.' + user_config.user_id + ' AND cc.cycle_label LIKE ? AND cc.status = "PENDING" AND cc.deleted IS NULL LIMIT ?,?', 
                ["%"+params.search+"%", params.page, params.limit],
                send_response
            )

            function send_response(err, res, args, last_query) {
                if (err) {
                    console.log(err);
                    console.log("Error in retrieving pending cycle count");
                    reject("Error in retrieving pending cycle count");
                }
                else {
                    resolve(res);
                }
            }
        })
    }

    module.get_pending_cyclecount_details = (params) => {
        return new Promise(function(resolve, reject) {   
            var cycle_label = null;
            var round = null;
            var date = null;
            var location_id = null;
            var location_code = null;
            var location_name = null;

            mysql.use(db)
            .query(
                'SELECT cc.cycle_label, cc.round, cc.created, cc.location_id, l.code AS location_code, l.name AS location_name FROM im_cycle_count cc, im_location l WHERE cc.location_id = l.id AND cc.id = ? AND cc.status = "PENDING" AND cc.deleted IS NULL', 
                [params.report_id],
                function(err1, res1) {
                    if (err1) {
                        console.log("Error in verifying report id in get pending cyclecount details");
                        reject(new Error("Error in verifying report_id"));
                    } 
                    else if (!res1.length) {
                        console.log("Report id not found in get pending cyclecount details");
                        reject(new Error("Cycle count report not found"));
                    }
                    else {
                        cycle_label = res1[0].cycle_label;
                        round = res1[0].round;
                        date = res1[0].created;
                        location_id = res1[0].location_id;
                        location_code = res1[0].location_code;
                        location_name = res1[0].location_name;
                        start();
                    }
                }
            )

            function start() {
                mysql.use(db)
                .query(
                    'SELECT cd.id, cd.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name FROM im_cycle_count_details cd, ' + item_config.item_table + ' i WHERE cd.item_id = i.' + item_config.item_id + ' AND cd.cycle_count_id = ? AND (cd.variance IS NULL OR cd.variance != 0.0) LIMIT ?,?', 
                    [params.report_id, params.page, params.limit],
                    send_response
                )
            }

            function send_response(err, res, args, last_query) {
                if (err) {
                    console.log(err);
                    console.log("Error in retrieving pending cycle count details");
                    reject("Error in retrieving pending cycle count details");
                }
                else {
                    var response = {};
                    response.date = date;
                    response.cycle_label = cycle_label;
                    response.round = round;
                    response.location_id = location_id;
                    response.location_code = location_code;
                    response.location_name = location_name;
                    response.items = res;
                    resolve(response);
                }
            }
        })
    }

    module.cyclecount = (params) => {
        return new Promise(function(resolve, reject) {
            var round = null;
            var max_cycle = null;
            var status = null;

            mysql.use(db)
            .query(
                'SELECT * FROM im_cycle_count WHERE id = ? AND status = "PENDING" AND deleted IS NULL', 
                [params.report_id],
                function(err1, res1) {
                    if (err1) {
                        console.log("Error in verifying report id in get pending cyclecount details");
                        reject(new Error("Error in verifying report_id"));
                    } 
                    else if (!res1.length) {
                        console.log("Report id not found in init cyclecount");
                        reject(new Error("Cycle count report not found"));
                    }
                    else {
                        round = res1[0].round;
                        max_cycle = res1[0].max_cycle;
                        status = res1[0].status;
                        async.each(params.items, update_details, send_response);
                    }
                }
            )

            function update_details(row, callback) {
                function send_callback(err, result) {
                    if (err) {
                        console.log('Error in updating cyclecount report details');
                        return callback(err);
                    }
                    return callback();
                }
                
                mysql.use(db)
                .query(
                    'UPDATE im_cycle_count_details SET cc_count = ?, variance = (? - actual_quantity) WHERE item_id = ? AND cycle_count_id = ?', 
                    [row.item_count, row.item_count, row.item_id, params.report_id],
                    send_callback
                )
            }
            

            function send_response(err, res) {
                if (err) {
                    console.log("Error in updating cycle count details");
                    reject("Error in updating cycle count");
                }
                else {
                    round = round + 1;
                    if (round == max_cycle) {
                        status = "DONE";
                    }
                    mysql.use(db)
                    .query(
                        'UPDATE im_cycle_count SET round = ?, status = ? WHERE id = ?', 
                        [round, status, params.report_id],
                        function(err1, res1) {
                            if (err1) {
                                console.log(err1);
                                reject("Error in updating cycle count");
                            }
                            else {
                                resolve();
                            }
                        }
                    )
                }
            }
        })
    }

    module.get_cyclecount_history = (params) => {
        return new Promise(function(resolve, reject) {      

            if (typeof params.search === 'undefined' || params.search === undefined) {
                params.search = '';
            }

            mysql.use(db)
            .query(
                'SELECT cc.id, cc.created AS date, cc.cycle_label, cc.location_id, l.code AS location_code, l.name AS location_name, cc.user_id, u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name, cc.round, cc.max_cycle FROM im_cycle_count cc, im_location l, ' + user_config.user_table + ' u WHERE cc.location_id = l.id AND cc.user_id = u.' + user_config.user_id + ' AND cc.cycle_label LIKE ? AND cc.status = "DONE" AND cc.deleted IS NULL LIMIT ?,?', 
                ["%"+params.search+"%", params.page, params.limit],
                send_response
            )

            function send_response(err, res, args, last_query) {
                if (err) {
                    console.log(err);
                    console.log("Error in retrieving cycle count history");
                    reject("Error in retrieving cycle count history");
                }
                else {
                    resolve(res);
                }
            }
        })
    }

    module.get_cyclecount_history_details = (params) => {
        return new Promise(function(resolve, reject) {   
            var cycle_label = null;
            var round = null;
            var date = null;
            var location_id = null;
            var location_code = null;
            var location_name = null;

            mysql.use(db)
            .query(
                'SELECT cc.cycle_label, cc.round, cc.created, cc.location_id, l.code AS location_code, l.name AS location_name FROM im_cycle_count cc, im_location l WHERE cc.location_id = l.id AND cc.id = ? AND cc.status = "DONE" AND cc.deleted IS NULL', 
                [params.report_id],
                function(err1, res1) {
                    if (err1) {
                        console.log("Error in verifying report id in get cyclecount history details");
                        reject(new Error("Error in verifying report_id"));
                    } 
                    else if (!res1.length) {
                        console.log("Report id not found in get cyclecount history details");
                        reject(new Error("Cycle count report not found"));
                    }
                    else {
                        cycle_label = res1[0].cycle_label;
                        round = res1[0].round;
                        date = res1[0].created;
                        location_id = res1[0].location_id;
                        location_code = res1[0].location_code;
                        location_name = res1[0].location_name;
                        start();
                    }
                }
            )

            function start() {
                mysql.use(db)
                .query(
                    'SELECT cd.id, cd.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, cd.actual_quantity AS item_quantity, cd.cc_count AS item_count, cd.variance FROM im_cycle_count_details cd, ' + item_config.item_table + ' i WHERE cd.item_id = i.' + item_config.item_id + ' AND cd.cycle_count_id = ? LIMIT ?,?', 
                    [params.report_id, params.page, params.limit],
                    send_response
                )
            }

            function send_response(err, res, args, last_query) {
                if (err) {
                    console.log(err);
                    console.log("Error in retrieving cycle count history details");
                    reject("Error in retrieving cycle count history details");
                }
                else {
                    var response = {};
                    response.date = date;
                    response.cycle_label = cycle_label;
                    response.round = round;
                    response.location_id = location_id;
                    response.location_code = location_code;
                    response.location_name = location_name;
                    response.items = res;
                    resolve(response);
                }
            }
        })
    }

    module.get_movement_history = (params) => {
        return new Promise(function(resolve, reject) {
            let movement = {};
            let items = [];

            if (typeof params.search_item === 'undefined' || params.search_item === undefined) {
                params.search_item = '';
            }

            if (typeof params.search_location === 'undefined' || params.search_location === undefined) {
                params.search_location = '';
            }

            if ((typeof params.from_date !== 'undefined' && params.from_date !== undefined) && (typeof params.to_date !== 'undefined' && params.to_date !== undefined)) {
                mysql.use(db)
                .query(
                    `SELECT mt.id AS transaction_id, mt.type, mt.user_id, 
                        u.` + user_config.user_first_name + ` AS user_first_name, u.` + user_config.user_last_name + ` AS user_last_name,
                        mt.created AS timestamp,
                        (SELECT COUNT(*) FROM im_movement_transaction
                            WHERE (created BETWEEN ? AND ?)
                            AND deleted IS NULL) AS total
                        FROM im_movement_transaction mt, ` + user_config.user_table + ` u
                        WHERE (mt.created BETWEEN ? AND ?)
                        AND mt.user_id = u.` + user_config.user_id + `
                        AND mt.deleted IS NULL
                        LIMIT ?, ?`,
                        [params.from_date, params.to_date, params.from_date, params.to_date, params.page, params.limit],
                        prepare_get_movements
                ) 
            }
            else {
                mysql.use(db)
                .query(
                    `SELECT mt.id AS transaction_id, mt.type, mt.user_id, 
                        u.` + user_config.user_first_name + ` AS user_first_name, u.` + user_config.user_last_name + ` AS user_last_name,
                        mt.created AS timestamp,
                        (SELECT COUNT(*) FROM im_movement_transaction
                            WHERE deleted IS NULL) AS total
                        FROM im_movement_transaction mt, ` + user_config.user_table + ` u
                        WHERE mt.user_id = u.` + user_config.user_id + `
                        AND mt.deleted IS NULL
                        LIMIT ?, ?`,
                        [params.page, params.limit],
                        prepare_get_movements
                ) 
            } 
            
            function prepare_get_movements(err, transactions) {
                if (err) {
                    console.log(err);
                    reject(err);
                }
                else {
                    async.each(transactions, get_movements, send_response);
                }
            }

            function get_movements(row, callback) {
                function send_callback(err, result) {
                    if (err) {
                        console.log('Error in creating item movement');
                        return callback(err);
                    }
                    row['movements'] = result;
                    items.push(row);
                    return callback();
                }

                mysql.use(db)
                .query(
                    `SELECT mv.id, mv.item_id, mv.quantity,
                    i.` + item_config.item_name + ` AS item_sku, i.` + item_config.item_name + ` AS item_name,
                        mv.location_id, l.code, l.name,
                        mv.expiration_date, mv.remarks
                        FROM im_item_movement mv, im_location l,
                        ` + item_config.item_table + ` i
                        WHERE mv.location_id = l.id
                        AND mv.item_id = i.` + item_config.item_id + `
                        AND (i.` + item_config.item_name + ` LIKE ? OR i.` + item_config.item_name + ` LIKE ?)
                        AND (l.name LIKE ? OR l.code LIKE ?)
                        AND mv.transaction_id = ?`,
                        ["%"+params.search_item+"%", "%"+params.search_item+"%", "%"+params.search_location+"%", "%"+params.search_location+"%", row.transaction_id],
                        send_callback
                ) 
            }

            function send_response(err, res) {
                if (err) {
                    console.log(err);
                    reject(err);
                }
                else {
                    if (items.length) {
                        movement.total = items[0].total;
                        for (let i=0;i<items.length;i++) {
                            delete items[i].total;
                        }
                    }
                    else {
                        movement.total = 0;
                    }
                    movement.items = items;
                    resolve(movement);
                }
            }
        })
    }

    module.create_location = (params) => {
        return new Promise(function(resolve, reject) {
            
            params.id = uuid.v4();

            let location = {};
             
            mysql.use(db)
            .query(
                `SELECT * FROM im_location 
                    WHERE code = ? AND user_id = ? 
                    AND deleted IS NULL`,
                    [params.code, params.user_id],
                    function(err, result) {
                        if (err) {
                            console.log(err);
                            reject(err);
                        }
        
                        if (result.length) {
                            console.log("Location already exists");             
                            reject(err);
                                
                        }
                        else {
                            if (params.status == false || params.status.toLowerCase() == "false") { //create a deactivated location
                                mysql.use(db)
                                .query(
                                    `INSERT INTO im_location (id, code, name, description, user_id, deleted) 
                                        VALUES (?, ?, ?, ?, ?, now())`,
                                        [params.id, params.code, params.name, params.description, params.user_id],
                                        send_response
                                )
                            }
                            else { //create an activated location
                                mysql.use(db)
                                .query(
                                    `INSERT INTO im_location (id, code, name, description, user_id) 
                                        VALUES (?, ?, ?, ?, ?)`,
                                        [params.id, params.code, params.name, params.description, params.user_id],
                                        send_response
                                )
                            }
                        }
                    }
                )            

            function send_response(error, result, args, last_query){
                if (error) {
                    console.log(error);
                    reject(error);
                }
                else {
                    location.message = "Successfully created a new location";
                    location.items = params;
                    resolve(location);
                }
            }
        })
    }


    module.retrieve_locations = (params) => {
        return new Promise(function(resolve, reject) {
            let filter_query = ' ';
            let location = {};

            if (params.filter_status == false || params.filter_status.toLowerCase() == "false") {
                filter_query = ' AND deleted IS NOT NULL ';   
            }

            else {
                filter_query = ' AND deleted IS NULL ';     
            }
            
            mysql.use(db)
            .query(
                `SELECT id, code, name, description, user_id,
                    created AS date_created, 
                    updated AS date_updated,
                    deleted AS date_deleted,
                    (SELECT COUNT(*) 
                    FROM im_location 
                    WHERE (code LIKE ? OR name LIKE ?)` + filter_query + `) 
                    AS total 
                    FROM im_location
                    WHERE (code LIKE ? OR name LIKE ?)` + filter_query + `
                    LIMIT ?, ?`,
                    ["%"+params.search+"%", "%"+params.search+"%", "%"+params.search+"%", "%"+params.search+"%", params.page, params.limit],
                    function(err, result) {
                        if (err) {
                            console.log(err);
                            reject(err);
                        }
                        else {
                            if (result.length) {
                                location.total = result[0].total;
                                for (var i=0;i<result.length;i++) {
                                    delete result[i].total;
                                }
                            }
                            else {
                                location.total = 0;
                            }
                            location.items = result;

                            resolve(location);
                        }
                    }
            )

        })
    }


    module.retrieve_location = (params) => {
        return new Promise(function(resolve, reject) {
            let location = {}; 
            mysql.use(db)
            .query(
                `SELECT id, code, name, description, user_id,
                    created AS date_created, 
                    updated AS date_updated,
                    deleted AS date_deleted 
                    FROM im_location 
                    WHERE id = ?`,
                    [params.id],
                    function(err, result) {
                        if (err) {
                            console.log(err);
                            reject(err);
                        }
                        else{                        
                            location.items = result;
                                
                            resolve(location);
                        } 
                        
                    }
            )
            .end();

        })
    }


    module.change_location_status = (params) => {
        return new Promise(function(resolve, reject) {
            let location = {};

            mysql.use(db)
            .query(
                `SELECT * FROM im_location 
                    WHERE id = ? AND user_id = ? 
                    AND deleted IS NULL`,
                    [params.id, params.user_id],
                    function(err, res) {
                        if (err) {
                            console.log(err);
                            reject(err);
                        }
                        else if (!res.length) {
                            console.log("Location not found")
                            reject(new Error("Location not found"));
                        }
                        else {
                            if (params.status == false || params.status.toLowerCase() == "false") {
                                mysql.use(db)
                                .query(
                                    `UPDATE im_location SET deleted = now(), updated = now()
                                        WHERE id = ? and user_id = ?`,
                                        [params.id, params.user_id],
                                        send_response
                                )
                            }
                            else {
                                mysql.use(db)
                                .query(
                                    `UPDATE im_location SET deleted = NULL, updated = now()
                                        WHERE id = ? and user_id = ?`,
                                        [params.id, params.user_id],
                                        send_response
                                )
                            }
                        }
                    }
            )

            function send_response(err, res) {
                if (err) {
                    console.log(err);
                    reject(err);
                }
                else {
                    location.message = "Successfully updated location status";
                    location.items = params;
                    resolve(location);
                }
            }

        })
    }



    module.update_location = (params) => {
        return new Promise(function(resolve, reject) {
            
            let location = {};

            mysql.use(db)
            .query(
                `SELECT * FROM im_location 
                    WHERE id = ? AND user_id = ? 
                    AND deleted IS NULL`,
                    [params.id, params.user_id],
                    function(err, res) {
                        if (err) {
                            console.log(err);
                            reject(err);
                        }
                        else if (!res.length) {
                            console.log("Location not found")
                            reject(new Error("Location not found"));
                        }
                        else if (typeof params.code !== 'undefined' && params.code !== undefined) {
                            find_code_duplicate();
                        }
                        else {
                            mysql.use(db)
                            .query(
                                `UPDATE im_location SET ?
                                    WHERE id = ? and user_id = ?`,
                                    [params, params.id, params.user_id],
                                    send_response
                            )
                        }
                    }
            )

            function find_code_duplicate() {
                mysql.use(db)
                .query(
                    `SELECT * FROM im_location
                        WHERE code = ? AND id != ?`,
                        [params.code, params.id],
                        function(err, res) {
                            if (err) {
                                console.log(err);
                                reject(err);
                            }
                            else if (res.length) {
                                console.log("Code already exists")
                                reject(new Error("Code already exists"));
                            }
                            else {
                                mysql.use(db)
                                .query(
                                    `UPDATE im_location SET ?
                                        WHERE id = ? and user_id = ?`,
                                        [params, params.id, params.user_id],
                                        send_response
                                )
                            }
                        }
                )
            }

            function send_response(err, res) {
                if (err) {
                    console.log(err);
                    reject(err);
                }
                else {
                    location.message = "Successfully updated location";
                    location.items = params;
                    resolve(location);
                }
            }

        })
    }

    module.deposit = (params) => {
        return new Promise(function(resolve, reject) {
            let transaction_id = uuid.v4();
            let movement = {};

            mysql.use(db)
            .query(
                `INSERT INTO im_movement_transaction(id, user_id, type)
                    VALUES (?, ?, "DEPOSIT")`,
                    [transaction_id, params.user_id],
                    function(err, res) {
                        if (err) {
                            console.log(err);
                            reject(err);
                        }
                        else {
                            async.each(params.items, insert_items, send_response);
                        }
                    }
            )

            function insert_items(row, callback) {
                function send_callback(err, result) {
                    if (err) {
                        console.log('Error in creating item movement');
                        return callback(err);
                    }
                    return callback();
                }

                if (row.expiration_date == null || row.expiration_date == 'null' || row.expiration_date == '') {
                    mysql.use(db)
                    .query(
                        `INSERT INTO im_item_movement
                            (id, transaction_id, item_id, quantity, location_id, remarks, type, user_id) 
                            VALUES (?, ?, ?, ?, ?, ?, "DEPOSIT", ?)`, 
                            [uuid.v4(), transaction_id, row.item_id, row.quantity, row.location_id, row.remarks, params.user_id],
                            send_callback
                    )
                }

                else {
                    mysql.use(db)
                    .query(
                        `INSERT INTO im_item_movement
                            (id, transaction_id, item_id, quantity, location_id, expiration_date, remarks, type, user_id) 
                            VALUES (?, ?, ?, ?, ?, ?, ?, "DEPOSIT", ?)`, 
                            [uuid.v4(), transaction_id, row.item_id, row.quantity, row.location_id, row.expiration_date, row.remarks, params.user_id],
                            send_callback
                    )
                }
            }

            function send_response(err, result) {
                if (err) {
                    console.log(err);
                    reject(err);
                }
                else {
                    movement.user_id = params.user_id;
                    movement.type = "DEPOSIT";
                    movement.items = params.items;
                    movement.message = "Deposit successful";
                    resolve(movement);
                }
            }
        })
    }

    module.withdraw = (params) => {
        return new Promise(function(resolve, reject) {
            
            let transaction_id = uuid.v4();
            let movement = {};

            mysql.use(db)
            .query(
                `INSERT INTO im_movement_transaction(id, user_id, type)
                    VALUES (?, ?, "WITHDRAW")`,
                    [transaction_id, params.user_id],
                    function(err, res) {
                        if (err) {
                            console.log(err);
                            reject(err);
                        }
                        else {
                            async.each(params.items, insert_items, send_response);
                        }
                    }
            )

            function insert_items(row, callback) {
                function send_callback(err, result) {
                    if (err) {
                        console.log('Error in creating item movement');
                        return callback(err);
                    }
                    return callback();
                }

                mysql.use(db)
                .query(
                    `INSERT INTO im_item_movement
                        (id, transaction_id, item_id, quantity, location_id, expiration_date, remarks, type, user_id) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, "WITHDRAW", ?)`, 
                        [uuid.v4(), transaction_id, row.item_id, row.quantity, row.location_id, row.expiration_date, row.remarks, params.user_id],
                        send_callback
                )
            }

            function send_response(err, result) {
                if (err) {
                    console.log(err);
                    reject(err);
                }
                else {
                    movement.user_id = params.user_id;
                    movement.type = "WITHDRAW";
                    movement.items = params.items;
                    movement.message = "Withdraw successful";
                    resolve(movement);
                }
            }
        })
  
    }

    module.transfer = (params) => {
        return new Promise(function(resolve, reject) {

            let transaction_id = uuid.v4();
            let movement = {};

            mysql.use(db)
            .query(
                `INSERT INTO im_movement_transaction(id, user_id, type)
                    VALUES (?, ?, "TRANSFER")`,
                    [transaction_id, params.user_id],
                    function(err, res) {
                        if (err) {
                            console.log(err);
                            reject(err);
                        }
                        else {
                            async.each(params.items, insert_items, send_response);
                        }
                    }
            )

            function insert_items(row, callback) {
                function send_callback(err, result) {
                    if (err) {
                        console.log('Error in creating item movement');
                        return callback(err);
                    }
                    return callback();
                }

                if (row.expiration_date == null || row.expiration_date == 'null' || row.expiration_date == '') {
                    mysql.use(db)
                    .query(
                        `INSERT INTO im_item_movement
                            (id, transaction_id, item_id, quantity, location_id, remarks, type, user_id) 
                            VALUES (?, ?, ?, ?, ?, ?, "WITHDRAW", ?)`, 
                            [uuid.v4(), transaction_id, row.item_id, row.quantity, row.source_id, row.remarks, params.user_id],
                            function(err, res) {
                                if (err) {
                                    console.log(err);
                                    reject(err);
                                }
                                else {
                                    mysql.use(db)
                                    .query(
                                        `INSERT INTO im_item_movement
                                            (id, transaction_id, item_id, quantity, location_id, remarks, type, user_id) 
                                            VALUES (?, ?, ?, ?, ?, ?, "DEPOSIT", ?)`, 
                                            [uuid.v4(), transaction_id, row.item_id, row.quantity, row.destination_id, row.remarks, params.user_id],
                                            send_callback
                                    )
                                }
                            }
                    )
                }

                else {
                    mysql.use(db)
                    .query(
                        `INSERT INTO im_item_movement
                            (id, transaction_id, item_id, quantity, location_id, expiration_date, remarks, type, user_id) 
                            VALUES (?, ?, ?, ?, ?, ?, ?, "WITHDRAW", ?)`, 
                            [uuid.v4(), transaction_id, row.item_id, row.quantity, row.source_id, row.expiration_date, row.remarks, params.user_id],
                            function(err, res) {
                                if (err) {
                                    console.log(err);
                                    reject(err);
                                }
                                else {
                                    mysql.use(db)
                                    .query(
                                        `INSERT INTO im_item_movement
                                            (id, transaction_id, item_id, quantity, location_id, expiration_date, remarks, type, user_id) 
                                            VALUES (?, ?, ?, ?, ?, ?, ?, "DEPOSIT", ?)`, 
                                            [uuid.v4(), transaction_id, row.item_id, row.quantity, row.destination_id, row.expiration_date, row.remarks, params.user_id],
                                            send_callback
                                    )
                                }
                            }
                    )
                }
            }

            function send_response(err, result) {
                if (err) {
                    console.log(err);
                    reject(err);
                }
                else {
                    movement.user_id = params.user_id;
                    movement.type = "TRANSFER";
                    movement.items = params.items;
                    movement.message = "Transfer successful";
                    resolve(movement);
                }
            }
            
        })
    }


    return module;
};

