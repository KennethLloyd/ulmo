'use strict'

const mysql             = require('anytv-node-mysql');
const config            = require(__dirname + '/config/config');
const promise           = require('promise');
<<<<<<< HEAD
const winston           = require('winston');
const async             = require("async");
const uuid              = require("uuid");
=======
const uuid              = require('uuid');
>>>>>>> 941de4d0af4413d1440bf222cece0bec0500442f

mysql.add('bgw73vdwex88xb6h', config.bgw73vdwex88xb6h_DB);

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

    module.get_current_inventory = (params) => {
        return new Promise(function(resolve, reject) {
            var response = [];
            var latest_balance = [];
            var pagination = null;
            var balance_date = null;

            if (typeof params.search_item === 'undefined' || params.search_item === undefined) {
                params.search_item = '';
            }
            if (typeof params.is_breakdown === 'undefined' || params.is_breakdown === undefined) {
                params.is_breakdown = 1;
            }
            if (typeof params.is_grouped === 'undefined' || params.is_grouped === undefined) {
                params.is_grouped = 1;
            }

            /*if (params.page === -1) {
                pagination = "";
            }
            else {
                pagination = "LIMIT " + params.page + ", " + params.limit; 
            }*/
            pagination = "";
            

            get_latest_balance_header();

            function get_latest_balance_header() {
                mysql.use(db)
                    .query(
                        'SELECT * FROM im_balance_history WHERE user_id = ? AND deleted IS NULL ORDER BY created DESC LIMIT 1',
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
                                balance_date = format_date(res[0].created);
                                get_latest_balance_details(res[0].id);
                            }
                        }
                    )
            }

            function get_latest_balance_details(balance_id) {
                var details_params = {
                    balance_id: balance_id,
                    location_id: params.location_id,
                    item_id: params.item_id, 
                    search_item: params.search_item,
                    is_breakdown: params.is_breakdown,
                    is_grouped: params.is_grouped,
                    page: -1, //to remove pagination in get_inventory
                    user_id: params.user_id
                }

                module.get_inventory(details_params)
                    .then(function(response) {
                        latest_balance = response;
                        /*for (var i=0;i<latest_balance.length;i++) {
                            for (var j=0;j<latest_balance[i].items.length;j++) {
                                console.log(latest_balance[i].items[j]);
                            }
                        }*/
                        start();
                    })
                    .catch(function(err) {           
                        winston.error('Error in getting balance history details', err);           
                        return next(err);
                    })
            }

            function start() {
                if (params.is_breakdown == 1) { //default for specific locations
                    if (params.location_id.length === 0) {
                        mysql.use(db)
                        .query(
                            'SELECT l.id AS location_id, l.code AS location_code, l.name AS location_name, u.' + user_config.user_id + ' AS user_id,  u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name FROM im_location l, ' + user_config.user_table + ' u WHERE u.' + user_config.user_id + ' = ? AND l.user_id = ? AND l.deleted IS NULL AND u.deleted IS NULL ORDER BY l.name',
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
                            'SELECT l.id AS location_id, l.code AS location_code, l.name AS location_name, u.' + user_config.user_id + ' AS user_id,  u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name FROM im_location l, ' + user_config.user_table + ' u WHERE l.id IN (?) AND u.' + user_config.user_id + ' = ? AND l.deleted IS NULL AND u.deleted IS NULL ORDER BY l.name',
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
                        'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity' + exp_clause + ' FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.location_id = ? AND mv.user_id = ? AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "DEPOSIT" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.created > ? AND mv.deleted IS NULL ' + group_clause + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                        [row.location_id, row.user_id, "%"+params.search_item+"%", "%"+params.search_item+"%", balance_date],
                        function(err1, res1) {
                            if (!err1) {
                                deposited = res1;
                                mysql.use(db)
                                .query(
                                    'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity' + exp_clause + ' FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.location_id = ? AND mv.user_id = ? AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "WITHDRAW" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.created > ? AND mv.deleted IS NULL ' + group_clause + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                                    [row.location_id, row.user_id, "%"+params.search_item+"%", "%"+params.search_item+"%", balance_date],
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
                        'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity' + exp_clause + ' FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.location_id = ? AND mv.item_id IN (?) AND mv.user_id = ? AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "DEPOSIT" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.created > ? AND mv.deleted IS NULL ' + group_clause + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                        [row.location_id, params.item_id, row.user_id, "%"+params.search_item+"%", "%"+params.search_item+"%", balance_date],
                        function(err1, res1) {
                            if (!err1) {
                                deposited = res1;
                                mysql.use(db)
                                .query(
                                    'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity' + exp_clause + ' FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.location_id = ? AND mv.item_id IN (?) AND mv.user_id = ? AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "WITHDRAW" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.created > ? AND mv.deleted IS NULL ' + group_clause + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                                    [row.location_id, params.item_id, row.user_id, "%"+params.search_item+"%", "%"+params.search_item+"%", balance_date],
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
                        'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.user_id = ? AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "DEPOSIT" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.created > ? AND mv.deleted IS NULL GROUP BY i.' + item_config.item_id + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                        [row.user_id, "%"+params.search_item+"%", "%"+params.search_item+"%", balance_date],
                        function(err1, res1) {
                            if (!err1) {
                                deposited = res1;
                                mysql.use(db)
                                .query(
                                    'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.user_id = ? AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "WITHDRAW" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.created > ? AND mv.deleted IS NULL GROUP BY i.' + item_config.item_id + ' ORDER BY i.' + item_config.item_name + ' ' + pagination,  
                                    [row.user_id, "%"+params.search_item+"%", "%"+params.search_item+"%", balance_date],
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
                        'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.item_id IN (?) AND mv.user_id = ? AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "DEPOSIT" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.created > ? AND mv.deleted IS NULL GROUP BY i.' + item_config.item_id + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                        [params.item_id, row.user_id, "%"+params.search_item+"%", "%"+params.search_item+"%", balance_date],
                        function(err1, res1) {
                            if (!err1) {
                                deposited = res1;
                                mysql.use(db)
                                .query(
                                    'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.item_id IN (?) AND mv.user_id = ? AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "WITHDRAW" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?)  AND mv.created > ? AND mv.deleted IS NULL GROUP BY i.' + item_config.item_id + ' ORDER BY i.' + item_config.item_name + ' ' + pagination,  
                                    [params.item_id, row.user_id, "%"+params.search_item+"%", "%"+params.search_item+"%", balance_date],
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
                    //merge latest balance and latest item movements
                    for (var i=0;i<response.length;i++) {
                        for (var j=0;j<latest_balance.length;j++) {
                            if (response[i].location_id === latest_balance[j].location_id) { //match same locations from movements and latest balance
                                response[i].items = response[i].items.concat(latest_balance[j].items);
                                response[i].items.sort(function(a, b) { //sort alphabetically by item name before matching
                                    var textA = a.item_name.toUpperCase();
                                    var textB = b.item_name.toUpperCase();
                                    return (textA < textB) ? -1 : (textA > textB) ? 1 : 0;
                                });
                                break;
                            }
                        }
                    }

                    for (var x=0;x<response.length;x++) { // for every location
                        if (response[x].items.length !== 0) {
                            var matched_items = [];
                            var items = response[x].items;
                            for (var i=0;i<items.length;i++) {
                                for (var j=i+1;j<items.length;j++) { //add the quantity of matched items then add to the list
                                    if ((params.is_grouped == 1 && (items[i].item_id == items[j].item_id)) || (params.is_grouped == 0 && (items[i].item_id == items[j].item_id) && items[i].expiration_date.toString() == items[j].expiration_date.toString())) { //if is_grouped, no need to match with expiration dates
                                        items[i].item_quantity = (items[i].item_quantity + items[j].item_quantity);
                                        matched_items.push(items[i]);
                                        break;
                                    } 
                                }
                            }
                            var final_items = matched_items;

                            for (var i=0;i<items.length;i++) {
                                var has_match = 0;
                                for (var j=0;j<matched_items.length;j++) { //add the items that did not match to the list as is
                                    if ((params.is_grouped == 1 && (items[i].item_id == matched_items[j].item_id)) || (params.is_grouped == 0 && (items[i].item_id == matched_items[j].item_id) && items[i].expiration_date.toString() == matched_items[j].expiration_date.toString())) { //if is_grouped, no need to match with expiration dates
                                        has_match = 1;
                                        break;
                                    } 
                                }
                                if (has_match == 0) {
                                    final_items.push(items[i])
                                }
                            }
                            final_items.sort(function(a, b) { //sort alphabetically by item name again after different manipulations
                                var textA = a.item_name.toUpperCase();
                                var textB = b.item_name.toUpperCase();
                                return (textA < textB) ? -1 : (textA > textB) ? 1 : 0;
                            });

                            if (params.page != -1) {
                                final_items = paginate(final_items, params.limit, params.page);
                            }
                            response[x].items = final_items;
                        }
                    }
                    resolve(response);
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
                        page: -1, //to remove pagination in get_current_inventory
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

    module.get_balance_history = (params) => {
        return new Promise(function(resolve, reject) {
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
                    'SELECT bh.id, bh.label, bh.created, bh.updated, bh.deleted, bh.user_id, u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name FROM im_balance_history bh, ' + user_config.user_table + ' u WHERE u.' + user_config.user_id + ' = bh.user_id AND bh.user_id = ? AND bh.label LIKE ? AND (bh.created BETWEEN ? AND ?) LIMIT ?,?',
                    [params.user_id, "%"+params.search+"%", params.from_date, params.to_date, params.page, params.limit],
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
            }
            else {
                mysql.use(db)
                .query(
                    'SELECT bh.id, bh.label, bh.created, bh.updated, bh.deleted, bh.user_id, u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name FROM im_balance_history bh, ' + user_config.user_table + ' u WHERE u.' + user_config.user_id + ' = bh.user_id AND bh.user_id = ? AND bh.label LIKE ? LIMIT ?,?',
                    [params.user_id, "%"+params.search+"%", params.page, params.limit],
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
            }
        }) 
    }

<<<<<<< HEAD
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
                        'SELECT bh.id AS balance_id, l.id AS location_id, l.code AS location_code, l.name AS location_name, u.' + user_config.user_id + ' AS user_id,  u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name, bh.created FROM im_balance_history bh, im_location l, ' + user_config.user_table + ' u WHERE l.id IN (SELECT DISTINCT location_id FROM im_balance_history_details WHERE balance_id = ?) AND u.' + user_config.user_id + ' = bh.user_id AND bh.id = ? AND bh.user_id = ?',
                        [params.balance_id, params.balance_id, params.user_id],
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
                        'SELECT bh.id AS balance_id, l.id AS location_id, l.code AS location_code, l.name AS location_name, u.' + user_config.user_id + ' AS user_id,  u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name, bh.created FROM im_balance_history bh, im_location l, ' + user_config.user_table + ' u WHERE l.id IN (SELECT DISTINCT location_id FROM im_balance_history_details WHERE balance_id = ?) AND l.id IN (?) AND u.' + user_config.user_id + ' = bh.user_id AND bh.id = ? AND bh.user_id = ?',
                        [params.balance_id, params.location_id, params.balance_id, params.user_id],
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
                    'SELECT bh.id AS balance_id, u.' + user_config.user_id + ' AS user_id,  u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name FROM im_balance_history bh, ' + user_config.user_table + ' u WHERE u.' + user_config.user_id + ' = bh.user_id AND bh.id = ? AND bh.user_id = ?',
                    [params.balance_id, params.user_id],
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
                        reject(new Error("Error in verifying location"));
                    } 
                    else if (!res1.length) {
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
                    user_id: params.user_id
                }
    
                module.get_current_inventory(retrieve_params)
                .then(function(response) {
                    send_response(response);
                })
                .catch(function(err) {           
                    console.log('Error in getting current inventory');           
                    reject(err);
                })
            }

            function send_response(inventory) {
                var expiration_dates_with_qty = [];
                var items = inventory[0].items;
                if (!items.length) {
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


    module.create_location = (data) => {
        return new Promise(function(resolve, reject) {
            
            let datum = data[0];
                datum.id=uuid.v4()
            let deleted = null;
            
            if(datum.status==false || datum.status.toLowerCase()=="false"){
                deleted = new Date();
            }
                     

            function start(){                
                mysql.use(db)
                .query(
                    'SELECT id,code FROM im_location WHERE code = ? AND user_id=? AND deleted IS NULL',
                    [datum.code, datum.user_id],
                    send_response
                ).end()                
            }

            function send_response(err, result, args, last_query){
                if (err) {
                    reject(err);
                }

                if (result.length > 0) {             
                    reject({code: "DUP_ENTRY"})
                        
                }else{
                    
                    mysql.use(db)
                    .query(
                        'INSERT INTO im_location (id, code, name, description, user_id, deleted) VALUES (?,?,?,?,?,?)',
                        [datum.id,datum.code, datum.name, datum.description, datum.user_id,deleted],
                        function(error, result) {
                            if (error) {
                                reject(error);
                            }else{
                                

                                let location = {
                                    message:    'Successfully created location',
                                    id:          datum.id,
                                    code:        datum.code,
                                    name:        datum.name,
                                    description: datum.description,
                                    user_id:     datum.user_id,
                                    status:      datum.status            
                                };
                                    
                                resolve([location])
                                
                            }
                                                
                        }
                    )
                    .end();

                }
            }

            start();

            

        })
    }


    module.retrieve_locations = (data) => {
        return new Promise(function(resolve, reject) {     
            
                let datum = data[0];

                let status  = '';

                if(datum.filter_status == undefined || datum.filter_status == null){
                    status=' ';
                }else if(datum.filter_status == true || datum.filter_status.toLowerCase() == "true"){
                    status=' AND deleted IS NULL';
                }else if(datum.filter_status == false || datum.filter_status.toLowerCase() == "false"){
                    status=' AND deleted IS NOT NULL';
                }

                let qry     = 'SELECT * ';
                let count   = 'SELECT COUNT(id) '
                let from    = ' FROM im_location WHERE user_id ='+datum.user_id;
                let where   = ' AND (code LIKE "%'+datum.search+'%" OR name LIKE "%'+datum.search+'%" OR name LIKE "%'+datum.description+'%")';                
                let limit   = ' LIMIT '+datum.page+','+datum.limit;


                if(!datum.search && !datum.filter_status){
                    qry += ',('+count+from+') AS "total"';
                    qry += from;
                }

                if(!datum.search && datum.filter_status){
                    qry += ',('+count+from+status+') AS "total"';
                    qry += from+status;
                }

                if(datum.search && datum.filter_status){
                    qry += ',('+count+from+status+where+') AS "total"';
                    qry += from+status+where;
                }

                let finalqry = qry+limit;                
                
                mysql.use(db)
                .query(
                    finalqry,
                    function(err, result, args, last_query){
                        if (err) {
                            reject(err);
                        }else if(result.length==0){
                            resolve({total:0, locations:[]});
                        }else{
                            
                            let total = result[0].total;
                            let locations = [];
                            let i =0;                            
                            for(i=0; i<result.length;i++){
                                let status = true;
                                if(result[i].deleted!=null){
                                    status = false;
                                }
                                locations.push({
                                    id          : result[i].id,
                                    code        : result[i].code,
                                    name        : result[i].name,
                                    description : result[i].description,
                                    created     : result[i].created,
                                    updated     : result[i].updated,
                                    deleted     : result[i].deleted,
                                    user_id     : result[i].user_id,
                                    status      : status
                                });

                                if(i==result.length-1){                                    
                                    resolve({total:total, locations:locations});
                                }
                            }
                            
                        } 
                    }
                ).end();        

        })
    }



    module.retrieve_location = (data) => {
        return new Promise(function(resolve, reject) {
            
            let datum = data[0];
            mysql.use(db)
            .query(
                'SELECT * FROM im_location WHERE user_id=? AND id=?',
                [datum.user_id,datum.id],
                function(err, result) {
                    if (err) {
                        reject(err);
                    }else if(result.length==0){
                        resolve([]);
                    }else{                        
                     
                        let status = true;
                        if(result[0].deleted!=null){
                            status = false;
                        }
                        let location = {
                            id          : result[0].id,
                            code        : result[0].code,
                            name        : result[0].name,
                            description : result[0].description,
                            created     : result[0].created,
                            updated     : result[0].updated,
                            deleted     : result[0].deleted,
                            user_id     : result[0].user_id,
                            status      : status
                        };
                                                      
                        resolve(location);
                            
                        
                    } 
                    
                }
            )
            .end();

        })
    }



    module.change_location_status = (data) => {
        return new Promise(function(resolve, reject) {
            
            let datum = data[0];
            mysql.use(db)
            .query(
                'SELECT * FROM im_location WHERE user_id=? AND id=?',
                [datum.user_id, datum.id],
                function(err, result) {
                    if (err) {
                        reject(err);
                    }else if(result.length==0){
                        resolve([]);
                    }else{                        
                     
                        if(result[0].deleted==null){

                            mysql.use(db)
                            .query(
                                'UPDATE im_location SET deleted = NOW() WHERE id = ?',
                                datum.id,
                                function(err1,result1){
                                    if (err1) {
                                        reject(err1);
                                    }else{

                                        mysql.use(db)
                                        .query(
                                            'SELECT * FROM im_location WHERE user_id=? AND id=?',
                                            [datum.user_id, datum.id],
                                            function(err, result) {
                                                if (err) {
                                                    reject(err);
                                                }else{
                                                    let location = {
                                                        id          : result[0].id,
                                                        code        : result[0].code,
                                                        name        : result[0].name,
                                                        description : result[0].description,
                                                        created     : result[0].created,
                                                        updated     : result[0].updated,
                                                        deleted     : result[0].deleted,
                                                        user_id     : result[0].user_id,
                                                        status      : false,
                                                        message     : "Successfully deactivated location"
                                                    };

                                                    resolve(location);
                                                }
                                            }
                                        ).end()

                                    }
                                }
                            ).end()

                        }else{

                            mysql.use(db)
                            .query(
                                'UPDATE im_location SET deleted = null WHERE id = ?',
                                datum.id,
                                function(err1,result1){
                                    if (err1) {
                                        reject(err1);
                                    }else{

                                        mysql.use(db)
                                        .query(
                                            'SELECT * FROM im_location WHERE user_id=? AND id=?',
                                            [datum.user_id, datum.id],
                                            function(err, result) {
                                                if (err) {
                                                    reject(err);
                                                }else{
                                                    let location = {
                                                        id          : result[0].id,
                                                        code        : result[0].code,
                                                        name        : result[0].name,
                                                        description : result[0].description,
                                                        created     : result[0].created,
                                                        updated     : result[0].updated,
                                                        deleted     : result[0].deleted,
                                                        user_id     : result[0].user_id,
                                                        status      : true,
                                                        message     : "Successfully activated location"
                                                    };
                                                    
                                                
                                                    resolve(location);
                                                }
                                            }
                                        ).end()

                                    }
                                }
                            ).end()

                        }
                            
                        
                    } 
                    
                }
            )
            .end();

        })
    }



    module.update_location = (data) => {
        return new Promise(function(resolve, reject) {
            
            let datum = data[0];

            function start(){                
                mysql.use(db)
                .query(
                    'SELECT id,code FROM im_location WHERE code = ? AND user_id=? AND deleted IS NULL',
                    [datum.code, datum.user_id],
                    send_response
                ).end()                
            }

            function send_response(err, result, args, last_query){
                if (err) {
                    reject(err);
                }

                if (result.length > 1) {             
                    reject({code: "DUP_ENTRY"})
                }else if (result.length == 1){
    
                    if(result[0].id == datum.id){
                        mysql.use(db)
                        .query(
                            'UPDATE im_location SET ? WHERE id = ? AND user_id=?',
                            [datum, datum.id, datum.user_id],
                            function(error, result) {
                                if (error) {
                                    reject(error);
                                }else{                                    
                                    let location = {
                                        message:    'Successfully updated location',
                                        id:          datum.id,
                                        code:        datum.code,
                                        name:        datum.name,
                                        description: datum.description,
                                        user_id:     datum.user_id          
                                    };
                                        
                                    resolve(location)
                                    
                                }
                                                    
                            }
                        )
                        .end();
                    }else{
                        reject({code: "NO_RECORD_UPDATED"})
                    }
                        
                }else{
                    
                    mysql.use(db)
                    .query(
                        'UPDATE im_location SET ? WHERE id = ? AND user_id=?',
                        [datum, datum.id, datum.user_id],
                        function(error, result) {
                            if (error) {
                                reject(error);
                            }else{
                                
                                let location = {
                                    message:    'Successfully updated location',
                                    id:          datum.id,
                                    code:        datum.code,
                                    name:        datum.name,
                                    description: datum.description,
                                    user_id:     datum.user_id          
                                };
                                    
                                resolve(location)
                                
                            }
                                                
                        }
                    )
                    .end();

                }
            }

            start();


        })
    }


    return module;
};




=======
    module.deposit = (data) => {
        return new Promise(function(resolve, reject) {
            const items = data[0]
            const user_id = data[1]
            const consolidated = consolidate_movement({
                'items' : items,
                'user_id' : user_id,
                'movement_label' : 'DEPOSIT'
            })
            if_location_exist({
                'location' : consolidated.location
            }).then(function (exists) {
                if (exists){
                    insert_stock({
                        'input' : consolidated.input
                    }).then(function (output) {
                        const res = {}
                        res["movement"] = consolidated.input
                        res["message"] = 'Item succesfully deposited'
                        resolve(res);
                    }).catch(function (err) {
                        reject(err);
                    })
                }
                else{
                    reject(new Error("Some location does not exist."));
                }
            }).catch(function (err) {
                reject(err);
            })
        })
    }

    module.withdraw = (data) => {
        return new Promise(function(resolve, reject) {
            const items = data[0]
            const user_id = data[1]
            const consolidated = consolidate_movement({
                'items' : items,
                'user_id' : user_id,
                'movement_label' : 'WITHDRAW'
            })
            if_location_exist({
                'location' : consolidated.location
            }).then(function (exists) {
                if (exists){
                    insert_stock({
                        'input' : consolidated.input
                    }).then(function (output) {
                        const res = {}
                        res["movement"] = consolidated.input
                        res["message"] = 'Item succesfully withdrawn'
                        resolve(res);
                    }).catch(function (err) {
                        reject(err);
                    })
                }
                else{
                    reject(new Error("Some location does not exist."));
                }
            }).catch(function (err) {
                reject(err);
            })
        })
    }

    function consolidate_movement(params) {
        const items = params.items
        const user_id = params.user_id
        const movement_label = params.movement_label
        const input = [];
        const location = [];
        items.forEach(element => {
            input.push([uuid.v4(), element.id, element.quantity, element.location_id, element.expiration_date, element.remarks, user_id, movement_label])
            if (location.indexOf(element.location_id) == -1){
                location.push(element.location_id)
            }
        });
        return {
            'input' : input,
            'location' : location
        }
    }

    function insert_stock(params) {
        return new Promise(function(resolve, reject) {
            const input = params.input
            mysql.use(db)
            .query(
                'INSERT INTO im_item_movement (id, item_id, quantity, location_id, expiration_date, remarks, user_id, type) VALUES ?',
                [input],
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
    }

    function if_location_exist(params) {
        return new Promise(function(resolve, reject) {
            const location = params.location
            mysql.use(db)
                .query(
                    'SELECT * from im_location WHERE id in (?)',
                    [location],
                    function(err1, res1) {
                        if (err1) {
                            reject(err1);
                        }

                        else {
                            if (location.length == res1.length){
                                resolve(true)
                            }
                            else{
                                resolve(false)
                            }
                        }
                    }
                )
                .end();
        })
    }

    return module;
};

module.exports('bgw73vdwex88xb6h').withdraw([
    [
        { id: '6abe0f64-e95d-11e8-9f32-f2801f1b9fd1',
          quantity: 10,
          location_id: '1',
          expiration_date: '', 
          remarks: 'test'},
        { id: '6abe0f64-e95d-11e8-9f32-f2801f1b9fd1',
          quantity: 10,
          location_id: '2',
          expiration_date: '', 
          remarks : 'test2'}
    ],
    '3911bcca-e93c-11e8-9f32-f2801f1b9fd1'
]).then(function(response) {
    console.log(response)
})
.catch(function(err) {         
    console.log(err)
})
>>>>>>> 941de4d0af4413d1440bf222cece0bec0500442f
