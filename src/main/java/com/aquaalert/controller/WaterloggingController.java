
package com.aquaalert.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class WaterloggingController {

    @GetMapping("/api/test")
    public String test() {
        return "AquaAlert backend is working!";
    }
}
