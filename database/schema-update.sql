/*2018-11-23*/
ALTER TABLE im_balance_history_details ADD COLUMN expiration_date DATETIME NULL DEFAULT NULL AFTER item_id;

/*2018-11-27*/
ALTER TABLE im_cycle_count ADD COLUMN location_id VARCHAR(100) NOT NULL AFTER id;