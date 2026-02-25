<?php
// 允许跨域（如果前端与后端不同域，可根据需要调整）
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

// 只允许预定义的词库名称，防止任意文件读取
$allowed_books = ['primary', 'junior', 'senior', 'cet4', 'cet6', 'tofel'];
$book = $_GET['book'] ?? '';

if (!in_array($book, $allowed_books)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid book name']);
    exit;
}

$file_path = __DIR__ . "/../word/{$book}.json";

if (!file_exists($file_path)) {
    // 文件不存在时返回空数组，也可以返回默认词库
    echo json_encode([]);
    exit;
}

$content = file_get_contents($file_path);
echo $content;