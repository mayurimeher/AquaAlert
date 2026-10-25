
package com.aquaalert.service;

import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import com.aquaalert.model.AppUser;
import com.aquaalert.repository.UserRepository;

@Service
public class CustomUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    public CustomUserDetailsService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public UserDetails loadUserByUsername(String username)
            throws UsernameNotFoundException {

        AppUser appUser = userRepository.findByUsername(username.trim())
                .orElseThrow(() -> new UsernameNotFoundException("User not found"));

        String role = appUser.getRole();

        if (role == null || role.isBlank()) {
            role = "USER";
        }

        return User.withUsername(appUser.getUsername())
                .password(appUser.getPassword())
                .roles(role.replace("ROLE_", ""))
                .build();
    }
}
