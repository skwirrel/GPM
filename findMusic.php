<?php
$baseDir = '/home/pi/mole/Music';
$ffprobeBinary = 'ffprobe';
$dbFile = '/home/pi/music.db';

$Directory = new RecursiveDirectoryIterator($baseDir);
$Iterator = new RecursiveIteratorIterator($Directory);
$Regex = new RegexIterator($Iterator, '/^.+\.mp3$/i', RecursiveRegexIterator::GET_MATCH);

echo "Counting music files... this may take a few moments...\n";
$numFiles = 0;
foreach( $Regex as $file ) {
    $numFiles++;
}

function output( $severity, $message ) {
    echo "$message\n";
}

if (!file_exists($dbFile)) output(2,"Creating new SQLite database file: $dbFile");
$db = new SQLite3($dbFile);

// Create the table if it doesn't exit
$tableExists = $db->querySingle("SELECT name FROM sqlite_master WHERE type='table' AND name='music';");
if (!$tableExists) {
    output(2,'Creating new music table in SQLite database');
    $db->exec("CREATE TABLE music(id INTEGER PRIMARY KEY, file TEXT, title TEXT, album TEXT, artist TEXT)");
    $db->exec("CREATE UNIQUE INDEX index_file ON music(file)");
    $db->exec("CREATE INDEX index_title ON music(title)");
    $db->exec("CREATE INDEX index_album ON music(album,title)");
    $db->exec("CREATE INDEX index_artist ON music(artist,album,title)");
}

echo "Found ".$numFiles." files\n";

$insertQuery = $db->prepare("INSERT OR REPLACE INTO music(file,title,album,artist) VALUES( :file, :title, :album, :artist )");
$c = 0;
foreach( $Regex as $file ) {
    $file = $file[0]; 

    $cmd = $ffprobeBinary.' -v quiet -print_format json -show_format '.escapeshellarg($file);
    $json = shell_exec($cmd);
    $metadata = json_decode($json,true);
    if (!isset($metadata['format']) || !isset($metadata['format']['tags'])) {
        output(-1,"Couldn't find ID3 data in file: ".$file);
        continue;
    }
    $tags = array_intersect_key($metadata['format']['tags'],array_flip(['album','title','artist']));
    if (count($tags)!=3) {
        output(-1,"Couldn't find all ID3 data (only found: ".implode(',',array_keys($tags)).") in file: ".$file );
    } else {
        foreach( $tags as $tag=>$value ) {
            // normalize the string
            $tag = preg_replace('/[^a-z0-9 ]+/','',strtolower(trim($value)));
        }
        $tags['file'] = $file;
        $insertQuery->reset();
        foreach( $tags as $tag=>$value ) {
            $insertQuery->bindValue(':'.$tag, $value, SQLITE3_TEXT);
        }
        $insertQuery->execute();
    }
        
    //if ($c++>1) break;
    $c++;
    printf("%03d%%:%06d:%s\n",$c/($numFiles/100),$c,$file);
}

$res = $db->query('SELECT * FROM music');
while ($row = $res->fetchArray(SQLITE3_ASSOC)) {
    print_r($row);
    echo implode(',',$row)."\n";
}
