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

    module.get_current_inventory = (params) => {
        return new Promise(function(resolve, reject) {
            var response = [];
            var latest_balance = [];
            var pagination = null;
            var balance_date = null;
            var ownership = null; 

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
                if (params.user_id === -1) {
                    ownership = "";
                }
                else {
                    ownership = "user_id = " + params.user_id + " AND";
                }

                mysql.use(db)
                .query(
                    'SELECT * FROM im_balance_history WHERE ' + ownership + ' deleted IS NULL ORDER BY created DESC LIMIT 1',
                    [],
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
                if (params.user_id === -1) {
                    ownership = "";
                }
                else {
                    ownership = "AND l.user_id = " + params.user_id;
                }

                if (params.is_breakdown == 1) { //default for specific locations
                    if (params.location_id.length === 0) {
                        mysql.use(db)
                        .query(
                            'SELECT l.id AS location_id, l.code AS location_code, l.name AS location_name, l.user_id,  u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name FROM im_location l, ' + user_config.user_table + ' u WHERE u.' + user_config.user_id + ' = l.user_id ' + ownership + ' AND l.deleted IS NULL AND u.deleted IS NULL ORDER BY l.name',
                            [],
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
                            'SELECT l.id AS location_id, l.code AS location_code, l.name AS location_name, l.user_id,  u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name FROM im_location l, ' + user_config.user_table + ' u WHERE l.id IN (?) ' + ownership + ' AND l.deleted IS NULL AND u.deleted IS NULL ORDER BY l.name',
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
                else { //location has been set to 'all'
                    if (params.user_id === -1) {
                        ownership = "";
                    }
                    else {
                        ownership = "u." + user_config.user_id + " = " + params.user_id + " AND";
                    }

                    mysql.use(db)
                    .query(
                        'SELECT u.' + user_config.user_id + ' AS user_id,  u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name FROM ' + user_config.user_table + ' u WHERE ' + ownership + ' u.deleted IS NULL',
                        [],
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

                if (params.user_id === -1) {
                    ownership = "";
                }
                else {
                    ownership = "AND mv.user_id = " + params.user_id;
                }
                
                if (params.item_id.length === 0) { //all items
                    //STOCK = SUM(deposited) - SUM(withdrawn)
                    mysql.use(db)
                    .query(
                        'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity' + exp_clause + ' FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.location_id = ? ' + ownership + ' AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "DEPOSIT" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.created > ? AND mv.deleted IS NULL ' + group_clause + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                        [row.location_id, "%"+params.search_item+"%", "%"+params.search_item+"%", balance_date],
                        function(err1, res1) {
                            if (!err1) {
                                deposited = res1;
                                mysql.use(db)
                                .query(
                                    'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity' + exp_clause + ' FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.location_id = ? ' + ownership + '  AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "WITHDRAW" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.created > ? AND mv.deleted IS NULL ' + group_clause + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                                    [row.location_id, "%"+params.search_item+"%", "%"+params.search_item+"%", balance_date],
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
                        'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity' + exp_clause + ' FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.location_id = ? AND mv.item_id IN (?) ' + ownership + ' AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "DEPOSIT" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.created > ? AND mv.deleted IS NULL ' + group_clause + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                        [row.location_id, params.item_id, "%"+params.search_item+"%", "%"+params.search_item+"%", balance_date],
                        function(err1, res1) {
                            if (!err1) {
                                deposited = res1;
                                mysql.use(db)
                                .query(
                                    'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity' + exp_clause + ' FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.location_id = ? AND mv.item_id IN (?) ' + ownership + ' AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "WITHDRAW" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.created > ? AND mv.deleted IS NULL ' + group_clause + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                                    [row.location_id, params.item_id, "%"+params.search_item+"%", "%"+params.search_item+"%", balance_date],
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

                if (params.user_id === -1) {
                    ownership = "";
                }
                else {
                    ownership = "AND mv.user_id = " + params.user_id;
                }

                if (params.item_id.length === 0) { //all items
                    //STOCK = SUM(deposited) - SUM(withdrawn)
                    mysql.use(db)
                    .query(
                        'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.item_id = i.' + item_config.item_id + ' ' + ownership + ' AND mv.type = "DEPOSIT" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.created > ? AND mv.deleted IS NULL GROUP BY i.' + item_config.item_id + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                        ["%"+params.search_item+"%", "%"+params.search_item+"%", balance_date],
                        function(err1, res1) {
                            if (!err1) {
                                deposited = res1;
                                mysql.use(db)
                                .query(
                                    'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.item_id = i.' + item_config.item_id + ' ' + ownership + ' AND mv.type = "WITHDRAW" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.created > ? AND mv.deleted IS NULL GROUP BY i.' + item_config.item_id + ' ORDER BY i.' + item_config.item_name + ' ' + pagination,  
                                    ["%"+params.search_item+"%", "%"+params.search_item+"%", balance_date],
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
                        'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.item_id IN (?) ' + ownership + ' AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "DEPOSIT" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.created > ? AND mv.deleted IS NULL GROUP BY i.' + item_config.item_id + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                        [params.item_id, "%"+params.search_item+"%", "%"+params.search_item+"%", balance_date],
                        function(err1, res1) {
                            if (!err1) {
                                deposited = res1;
                                mysql.use(db)
                                .query(
                                    'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.item_id IN (?) ' + ownership + ' AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "WITHDRAW" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?)  AND mv.created > ? AND mv.deleted IS NULL GROUP BY i.' + item_config.item_id + ' ORDER BY i.' + item_config.item_name + ' ' + pagination,  
                                    [params.item_id, "%"+params.search_item+"%", "%"+params.search_item+"%", balance_date],
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

                            var total_items = final_items.length;

                            if (params.page != -1) {
                                final_items = paginate(final_items, params.limit, params.page);
                            }
                            response[x].total = total_items;
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
            var ownership = null;

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
            if (params.user_id === -1) {
                ownership = "";
            }
            else {
                ownership = "AND bh.user_id = " + params.user_id;
            }

            params.from_date = format_date(params.from_date);
            params.to_date = format_date(params.to_date);

            if (params.from_date !== null && params.to_date !== null) {
                mysql.use(db)
                .query(
                    'SELECT bh.id, bh.label, bh.created, bh.updated, bh.deleted, bh.user_id, u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name FROM im_balance_history bh, ' + user_config.user_table + ' u WHERE u.' + user_config.user_id + ' = bh.user_id ' + ownership + ' AND bh.label LIKE ? AND (bh.created BETWEEN ? AND ?) LIMIT ?,?',
                    ["%"+params.search+"%", params.from_date, params.to_date, params.page, params.limit],
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
                    'SELECT bh.id, bh.label, bh.created, bh.updated, bh.deleted, bh.user_id, u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name FROM im_balance_history bh, ' + user_config.user_table + ' u WHERE u.' + user_config.user_id + ' = bh.user_id ' + ownership + ' AND bh.label LIKE ? LIMIT ?,?',
                    ["%"+params.search+"%", params.page, params.limit],
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

    module.get_inventory = (params) => {
        return new Promise(function(resolve, reject) {
            var response = [];
            var pagination = null;
            var ownership = null;

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

            if (params.user_id === -1) {
                ownership = "";
            }
            else {
                ownership = "AND bh.user_id = " + params.user_id;
            }

            if (params.is_breakdown == 1) { //default for specific locations
                if (params.location_id.length === 0) { //get for all locations
                    mysql.use(db)
                    .query(
                        'SELECT bh.id AS balance_id, bh.label, l.id AS location_id, l.code AS location_code, l.name AS location_name, u.' + user_config.user_id + ' AS user_id,  u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name, bh.created FROM im_balance_history bh, im_location l, ' + user_config.user_table + ' u WHERE l.id IN (SELECT DISTINCT location_id FROM im_balance_history_details WHERE balance_id = ?) AND u.' + user_config.user_id + ' = bh.user_id AND bh.id = ? ' + ownership,
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
                        'SELECT bh.id AS balance_id, bh.label, l.id AS location_id, l.code AS location_code, l.name AS location_name, u.' + user_config.user_id + ' AS user_id,  u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name, bh.created FROM im_balance_history bh, im_location l, ' + user_config.user_table + ' u WHERE l.id IN (SELECT DISTINCT location_id FROM im_balance_history_details WHERE balance_id = ?) AND l.id IN (?) AND u.' + user_config.user_id + ' = bh.user_id AND bh.id = ? ' + ownership,
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
                    'SELECT bh.id AS balance_id, bh.label, u.' + user_config.user_id + ' AS user_id,  u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name FROM im_balance_history bh, ' + user_config.user_table + ' u WHERE u.' + user_config.user_id + ' = bh.user_id AND bh.id = ? ' + ownership,
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
                    user_id: params.user_id
                }
    
                module.get_current_inventory(retrieve_params)
                .then(function(response) {
                    send_response(response);
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

    module.get_dashboard = (params) => {
        return new Promise(function(resolve, reject) {   
            var dashboard = {};

            var retrieve_params = {
                location_id: [],
                item_id: [],
                is_breakdown: 1,
                is_grouped: 1,
                page: -1, //to remove pagination in get_current_inventory
                user_id: -1 //all users
            }

            module.get_current_inventory(retrieve_params)
            .then(function(response) {
                dashboard.inventory = response;
                get_top_items_with_variance();
            })
            .catch(function(err) {               
                console.log('Error in getting current inventory inside get dashboard');     
                reject(err);
            })

            function get_top_items_with_variance() {
                mysql.use(db)
                .query(
                    'SELECT cd.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, cd.variance FROM im_cycle_count cc,  im_cycle_count_details cd, ' + item_config.item_table + ' i WHERE cc.status = "DONE" AND cc.id = cd.cycle_count_id AND cd.item_id = i.' + item_config.item_id + ' ORDER BY abs(cd.variance) DESC LIMIT 5',
                    function(err, res) {
                        if (err) {
                            console.log('Error in getting top items with variance inside get dashboard');     
                            reject(err);
                        }
                        else {
                            dashboard.variance = res;
                            get_latest_movements();
                        }
                    }
                )
            }
            
            function get_latest_movements() {
                mysql.use(db)
                .query(
                    'SELECT mv.id, (SELECT COUNT(*) FROM im_item_movement WHERE deleted IS NULL) AS total_movements, mv.type, mv.created AS timestamp, mv.user_id, u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name FROM im_item_movement mv, ' + user_config.user_table + ' u WHERE mv.user_id = u.' + user_config.user_id + ' AND mv.deleted IS NULL ORDER BY mv.created DESC LIMIT 5',
                    function(err, res) {
                        if (err) {
                            console.log('Error in getting latest movements inside get dashboard');     
                            reject(err);
                        }
                        else {
                            dashboard.movement = res;
                            resolve(dashboard);
                        }
                    }
                )
            }
        })
    }

    module.item_movement_history = (data) => {
        return new Promise(function(resolve, reject) {     
            
                let datum = data[0];

                let qry     = 'SELECT id, item_id, quantity, location_id, expiration_date, remarks, type';
                let count   = 'SELECT COUNT(id) ';
                let from    = ' FROM im_item_movement WHERE deleted IS NULL AND user_id = '+mysql.escape(datum.user_id);
                let where1  = ' AND location_id IN ('+mysql.escape(datum.location_id)+')';
                let where2  = ' AND item_id IN ('+mysql.escape(datum.item_id)+')';
                let limit   = ' LIMIT '+datum.page+','+datum.limit;

                if(!datum.location_id && !datum.item_id){
                    qry += ',('+count+from+') AS "total"';
                    qry += from;
                }

                if(datum.location_id && !datum.item_id){
                    qry += ',('+count+from+where1+') AS "total"';
                    qry += from+where1;
                }

                if(!datum.location_id && datum.item_id){
                    qry += ',('+count+from+where2+') AS "total"';
                    qry += from+where2;
                }

                if(datum.location_id && datum.item_id){
                    qry += ',('+count+from+where1+where2+') AS "total"';
                    qry += from+where1+where2;
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
                            let items = [];
                            let i =0;                            
                            for(i=0; i<result.length;i++){

                                items.push({
                                    id              : result[i].id,
                                    item_id         : result[i].item_id, 
                                    quantity        : result[i].quantity,
                                    location_id     : result[i].location_id,
                                    expiration_date : result[i].expiration_date,
                                    remarks         : result[i].remarks,
                                    type            : result[i].type
                                });

                                if(i==result.length-1){                                    
                                    resolve({total:total, items:items});
                                }
                            }
                            
                        } 
                    }
                ).end();        
            })
    }

    module.create_location = (data) => {
        return new Promise(function(resolve, reject) {
            
            const uuid =uuid.v4();

            let datum = data[0];
                datum.id=uuid
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

