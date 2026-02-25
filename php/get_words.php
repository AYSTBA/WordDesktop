<?php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

$book = $_GET['book'] ?? '';
$allowed_books = ['primary', 'junior', 'senior', 'cet4', 'cet6', 'tofel'];

if (!in_array($book, $allowed_books)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid book name']);
    exit;
}

$file_path = __DIR__ . "/../word/{$book}.json";

if (!file_exists($file_path)) {
    echo json_encode([]);
    exit;
}

readfile($file_path);