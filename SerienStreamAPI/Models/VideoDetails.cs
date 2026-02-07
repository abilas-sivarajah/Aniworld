namespace SerienStreamAPI.Models;

public class VideoDetails(
    int number,
    int? season,
    string title,
    string originalTitle,
    string description,
    VideoStream[] streams)
{
    public int Number { get; set; } = number;
    
    public int? Season { get; set; } = season;

    public string Title { get; set; } = title;

    public string OriginalTitle { get; set; } = originalTitle;

    public string Description { get; set; } = description;

    public VideoStream[] Streams { get; set; } = streams;
}